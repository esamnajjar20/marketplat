import os from 'os';
import { logger } from './logger';

/**
 * Estimates this API process group's Prisma connection demand against the
 * live PostgreSQL max_connections value queried at boot. Each PM2 worker has
 * its own Prisma pool, so the estimate multiplies the configured per-process
 * connection_limit by the resolved worker count. DB_POOL_INSTANCES can
 * override that count with the total Node process count across all Render
 * services sharing the same PostgreSQL instance.
 */

// Leave headroom for migrations, psql, pgAdmin, backup jobs, etc.
// running alongside the app's own pools.
const SAFETY_MARGIN = 6;

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

/** Resolve total Node pool processes, including an optional cross-service override. */
function estimateInstanceCount(): number {
  const deploymentTotal = process.env.DB_POOL_INSTANCES?.trim();
  if (deploymentTotal && /^\d+$/.test(deploymentTotal)) {
    const parsedTotal = Number.parseInt(deploymentTotal, 10);
    if (parsedTotal > 0) return parsedTotal;
  }
  const raw = process.env.PM2_INSTANCES?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    return parsed > 0 ? parsed : 2;
  }
  if (raw?.toLowerCase() === 'max') return os.cpus().length;
  // Keep this in sync with ecosystem.config.js, which defaults to 2.
  return 2;
}

export function checkConnectionCapacity(databaseUrl: string, maxConnections: number): void {
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1) {
    logger.warn('PostgreSQL max_connections could not be determined; skipping connection capacity check');
    return;
  }
  const connectionLimit = extractConnectionLimit(databaseUrl);
  if (connectionLimit === null) {
    logger.warn(
      'DATABASE_URL has no explicit connection_limit param — Prisma defaults to ' +
        'num_physical_cpus*2+1 per instance, which is usually too low under real ' +
        'concurrent load. See the connection_limit note in .env.example.'
    );
    return;
  }

  const instances = estimateInstanceCount();
  const estimatedTotal = connectionLimit * instances;
  const reservedHeadroom = Math.min(SAFETY_MARGIN, Math.floor(maxConnections * 0.3));
  const threshold = Math.max(1, maxConnections - reservedHeadroom);

  if (estimatedTotal > threshold) {
    logger.warn(
      `⚠️  Estimated total DB connections (${instances} instances × ` +
        `connection_limit=${connectionLimit} = ${estimatedTotal}) may exceed ` +
        `Postgres's configured max_connections (${maxConnections}), ` +
        `leaving less than the reserved connection headroom ` +
        `for migrations, admin tools, and backup jobs. Set DB_POOL_INSTANCES to ` +
        `include all Node processes across Render services sharing this database. ` +
        `Set PM2_INSTANCES explicitly when the platform allocation differs from the ` +
        `host CPU count, and configure connection_limit to match the service's pool budget.`,
      { instances, connectionLimit, estimatedTotal, threshold, maxConnections }
    );
  } else {
    logger.info(
      `DB connection capacity check passed: ${instances} instances × ` +
        `connection_limit=${connectionLimit} = ${estimatedTotal} ` +
        `(within configured max_connections=${maxConnections})`
    );
  }
}
