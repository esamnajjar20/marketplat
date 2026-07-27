import os from 'os';
import { logger } from './logger';

/**
 * FIX LOAD-01: PM2 cluster mode (ecosystem.config.js) runs N worker
 * processes, each with its OWN independent Prisma connection pool
 * (see the connection_limit note in .env.example). Total connections
 * actually opened against Postgres = N × connection_limit — but
 * nothing in the codebase computed or checked that product against
 * Postgres's own max_connections before this fix; the relationship
 * was only ever documented as a comment for a human to notice and
 * tune manually.
 *
 * This runs once at boot (called from server.ts) and logs a loud
 * warning — not a hard failure, since a deliberately tuned deployment
 * (fixed PM2_INSTANCES, a right-sized Postgres, PgBouncer in front,
 * etc.) may legitimately exceed this heuristic — if the estimated
 * total connection demand looks likely to exhaust Postgres's actual
 * max_connections.
 *
 * PROD-FIX-04: docker-compose.yml's postgres service now runs with
 * `-c max_connections=200` (previously the stock default of 100,
 * which this exact heuristic had already flagged as too low for
 * instances: 'max' on anything above a 4-core host). The threshold
 * below is intentionally still driven by an env var rather than
 * hardcoded to 200, since a deployment not using docker-compose.yml
 * (e.g. a managed Postgres instance) may run at a different
 * max_connections than what this repo's own compose file sets.
 */

const DEFAULT_POSTGRES_MAX_CONNECTIONS = 200;
// Leave headroom for migrations, psql, pgAdmin, backup jobs, etc.
// running alongside the app's own pools.
const SAFETY_MARGIN = 20;

function extractConnectionLimit(databaseUrl: string): number | null {
  try {
    const url = new URL(databaseUrl);
    const raw = url.searchParams.get('connection_limit');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Malformed URL is DATABASE_URL's own validation's problem
    // (env.ts requires it to be a non-empty string, not a well-formed
    // URL) — this check simply has nothing to say if it can't be parsed.
    return null;
  }
}

/**
 * Estimates the number of PM2 cluster workers this process will run
 * under. PM2_INSTANCES is only ever read by ecosystem.config.js
 * (outside the Node process itself, before PM2 even forks workers),
 * so the running process has no direct way to know the number PM2
 * actually resolved 'max' to — os.cpus().length is exactly the value
 * PM2 itself uses to resolve 'max', so it's not a guess, it's the same
 * computation PM2 performs.
 */
function estimateInstanceCount(): number {
  const raw = process.env.PM2_INSTANCES;
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return os.cpus().length;
}

export function checkConnectionCapacity(databaseUrl: string): void {
  const connectionLimit = extractConnectionLimit(databaseUrl);
  if (connectionLimit === null) {
    logger.warn(
      'DATABASE_URL has no explicit connection_limit param — Prisma defaults to ' +
      'num_physical_cpus*2+1 per instance, which is usually too low under real ' +
      'concurrent load. See the connection_limit note in .env.example.',
    );
    return;
  }

  const instances = estimateInstanceCount();
  const estimatedTotal = connectionLimit * instances;
  const threshold = DEFAULT_POSTGRES_MAX_CONNECTIONS - SAFETY_MARGIN;

  if (estimatedTotal > threshold) {
    logger.warn(
      `⚠️  Estimated total DB connections (${instances} instances × ` +
      `connection_limit=${connectionLimit} = ${estimatedTotal}) may exceed ` +
      `Postgres's configured max_connections (${DEFAULT_POSTGRES_MAX_CONNECTIONS}), ` +
      `leaving less than the recommended ${SAFETY_MARGIN}-connection safety margin ` +
      `for migrations, admin tools, and backup jobs. This is a heuristic based on ` +
      `os.cpus().length (${os.cpus().length} detected) and this repo's docker-compose.yml ` +
      `Postgres setting (max_connections=200, see PROD-FIX-04) — if this deployment ` +
      `runs a different Postgres (managed service, custom max_connections) or fixed ` +
      `PM2_INSTANCES to a smaller number, this warning may not apply. Otherwise, lower ` +
      `connection_limit in DATABASE_URL, set PM2_INSTANCES explicitly, or raise ` +
      `Postgres max_connections to match.`,
      { instances, connectionLimit, estimatedTotal, threshold },
    );
  } else {
    logger.info(
      `DB connection capacity check passed: ${instances} instances × ` +
      `connection_limit=${connectionLimit} = ${estimatedTotal} ` +
      `(within configured max_connections=${DEFAULT_POSTGRES_MAX_CONNECTIONS})`,
    );
  }
}
