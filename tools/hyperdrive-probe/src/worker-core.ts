import { constantTimeTokenEquals, extractBearerToken } from './auth.ts';

export interface HyperdriveBindingLike {
  readonly connectionString: string;
}

export interface HyperdriveProbeEnv {
  readonly HYPERDRIVE?: HyperdriveBindingLike;
  readonly HYPERDRIVE_PROBE_TOKEN?: string;
}

export interface ProbeQueryResult {
  readonly rows: readonly unknown[];
}

export interface ProbeDatabaseClient {
  connect(): Promise<void>;
  query(statement: string): Promise<ProbeQueryResult>;
  end(): Promise<void>;
}

export type ProbeDatabaseClientFactory = (connectionString: string) => ProbeDatabaseClient;

const INTERNAL_PATH = '/__internal/db-probe';
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

      if (pathname !== INTERNAL_PATH) {
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

      const connectionString = env.HYPERDRIVE?.connectionString;
      if (!connectionString) {
        return jsonResponse({ ok: false, error: 'HYPERDRIVE_NOT_CONFIGURED' }, 503);
      }

      const client = createClient(connectionString);
      const startedAt = Date.now();
      try {
        await client.connect();

        const queryStartedAt = Date.now();
        const result = await client.query('SELECT 1::int AS ok');
        const queryDurationMs = Date.now() - queryStartedAt;
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
          queryDurationMs,
          totalDurationMs: Date.now() - startedAt,
        });
      } catch (error) {
        console.error('[hyperdrive-probe] database probe failed', getSafeDatabaseErrorCode(error));
        return jsonResponse({ ok: false, error: 'DATABASE_UNAVAILABLE' }, 503);
      } finally {
        // Never keep a request-scoped socket/client alive between Worker requests.
        // Hyperdrive, not this Worker instance, owns the reusable origin pool.
        try {
          await client.end();
        } catch (error) {
          console.warn('[hyperdrive-probe] client cleanup failed', getSafeDatabaseErrorCode(error));
        }
        // end() is attempted even when connect() fails, so partial sockets are cleaned up.
      }
    },
  };
}
