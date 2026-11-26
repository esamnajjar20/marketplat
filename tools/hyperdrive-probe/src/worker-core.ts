import { constantTimeTokenEquals, extractBearerToken } from './auth.ts';

export interface HyperdriveBindingLike {
  readonly connectionString: string;
}

export interface HyperdriveProbeEnv {
  readonly HYPERDRIVE?: HyperdriveBindingLike;
  readonly DIRECT_DATABASE_URL?: string;
  readonly HYPERDRIVE_PROBE_TOKEN?: string;
}

export type ProbeMode = 'hyperdrive' | 'direct';

export interface ProbeQueryResult {
  readonly rows: readonly unknown[];
}

export interface ProbeDatabaseClient {
  connect(): Promise<void>;
  query(statement: string): Promise<ProbeQueryResult>;
  end(): Promise<void>;
}

export type ProbeDatabaseClientFactory = (connectionString: string, mode: ProbeMode) => ProbeDatabaseClient;

const PROBE_PATHS: Readonly<Record<string, ProbeMode>> = {
  '/__internal/db-probe': 'hyperdrive',
  '/__internal/direct-db-probe': 'direct',
};
const HEALTH_PATH = '/health';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

function getSafeDatabaseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'UNKNOWN';
  const code = error.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'UNKNOWN';
}

/**
 * Build an isolated worker handler. The factory injection keeps the route and
 * auth behavior testable without a live PostgreSQL or Cloudflare environment.
 */
export function createHyperdriveProbeWorker(createClient: ProbeDatabaseClientFactory) {
  return {
    async fetch(request: Request, env: HyperdriveProbeEnv): Promise<Response> {
      const pathname = new URL(request.url).pathname;

      if (pathname === HEALTH_PATH) {
        if (request.method !== 'GET') {
          return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        }
        return jsonResponse({ ok: true, service: 'marketplat-hyperdrive-probe' });
      }

      const mode = PROBE_PATHS[pathname];
      if (!mode) {
        return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
      }

      if (request.method !== 'POST') {
        return new Response(null, {
          status: 405,
          headers: {
            allow: 'POST',
            'cache-control': 'no-store, max-age=0',
            'x-content-type-options': 'nosniff',
          },
        });
      }

      const suppliedToken = extractBearerToken(request);
      const authenticated = await constantTimeTokenEquals(suppliedToken, env.HYPERDRIVE_PROBE_TOKEN);
      if (!authenticated) {
        return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401);
      }

      const connectionString = mode === 'hyperdrive'
        ? env.HYPERDRIVE?.connectionString
        : env.DIRECT_DATABASE_URL;
      if (!connectionString) {
        return jsonResponse({
          ok: false,
          error: mode === 'hyperdrive' ? 'HYPERDRIVE_NOT_CONFIGURED' : 'DIRECT_DATABASE_NOT_CONFIGURED',
        }, 503);
      }

      const startedAt = performance.now();
      let client: ProbeDatabaseClient | undefined;
      try {
        // Include synchronous driver construction in the sanitized error boundary.
        client = createClient(connectionString, mode);
        const connectStartedAt = performance.now();
        await client.connect();
        const connectDurationMs = performance.now() - connectStartedAt;

        const queryStartedAt = performance.now();
        const result = await client.query('SELECT 1::int AS ok');
        const queryDurationMs = performance.now() - queryStartedAt;
        const firstRow = result.rows[0];
        const probeValue =
          typeof firstRow === 'object' && firstRow !== null && 'ok' in firstRow
            ? firstRow.ok
            : undefined;

        if (probeValue !== 1) {
          console.error('[hyperdrive-probe] health query returned an unexpected result');
          return jsonResponse({ ok: false, error: 'DATABASE_PROBE_FAILED' }, 503);
        }

        return jsonResponse({
          ok: true,
          database: 'reachable',
          probe: 'read-only',
          connectionMode: mode,
          connectDurationMs: Math.round(connectDurationMs * 100) / 100,
          queryDurationMs: Math.round(queryDurationMs * 100) / 100,
          totalDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        });
      } catch (error) {
        console.error(`[hyperdrive-probe] ${mode} database probe failed`, getSafeDatabaseErrorCode(error));
        return jsonResponse({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 503);
      } finally {
        // Never keep a request-scoped socket/client alive between Worker requests.
        // Hyperdrive, not this Worker instance, owns the reusable origin pool.
        if (client) {
          try {
            await client.end();
          } catch (error) {
            console.warn(`[hyperdrive-probe] ${mode} client cleanup failed`, getSafeDatabaseErrorCode(error));
          }
        }
        // end() is attempted even when connect() fails, so partial sockets are cleaned up.
      }
    },
  };
}
