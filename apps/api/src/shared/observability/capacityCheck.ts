import os from 'os';
import { logger } from './logger';

/**
 * Estimates this API process group's Prisma connection demand against the
 * live PostgreSQL max_connections value queried at boot. Each PM2 worker has
 * its own Prisma pool, so the estimate multiplies the configured per-process
 * connection_limit by the resolved worker count. DB_POOL_INSTANCES can
 * override that count with the total Node process count across all Render
 * services sharing the same PostgreSQL instance. DB_OTHER_CONNECTIONS adds
 * Go Worker and other non-Prisma connection pools to the same budget.
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
  if (deploymentTotal) {
    if (/^\d+$/.test(deploymentTotal)) {
      const parsedTotal = Number.parseInt(deploymentTotal, 10);
      if (Number.isSafeInteger(parsedTotal) && parsedTotal >= 1 && parsedTotal <= 500) {
        return parsedTotal;
      }
    }
    logger.warn('DB_POOL_INSTANCES must be an integer between 1 and 500; estimating this API service with the PM2 fallback');
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


/**
 * Connections used by non-Prisma clients that share this PostgreSQL server.
 * One Go Worker defaults to DB_MAX_OPEN_CONNS=2; enabling both Outbox and Push
 * Dispatch requires at least 4. Set DB_OTHER_CONNECTIONS to the aggregate maximum
 * across all Go Worker replicas plus cron and other non-Prisma PostgreSQL clients.
 */
function estimateOtherConnections(): number {
  const raw = process.env.DB_OTHER_CONNECTIONS?.trim();
  if (!raw) return 2;
  if (!/^\d+$/.test(raw)) {
    logger.warn('DB_OTHER_CONNECTIONS must be a non-negative integer; using the safe default of 2');
    return 2;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed > 500) {
    logger.warn('DB_OTHER_CONNECTIONS is outside the supported range 0-500; using the safe default of 2');
    return 2;
  }
  return parsed;
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
  const estimatedNodeTotal = connectionLimit * instances;
  const estimatedOtherConnections = estimateOtherConnections();
  const estimatedTotal = estimatedNodeTotal + estimatedOtherConnections;
  const reservedHeadroom = Math.min(SAFETY_MARGIN, Math.floor(maxConnections * 0.3));
  const threshold = Math.max(1, maxConnections - reservedHeadroom);

  if (estimatedTotal > threshold) {
    logger.warn(
      `⚠️  Estimated total DB connections (${instances} Node instances × ` +
        `connection_limit=${connectionLimit} = ${estimatedNodeTotal}, plus ` +
        `${estimatedOtherConnections} non-Prisma connections = ${estimatedTotal}) may exceed ` +
        `Postgres's configured max_connections (${maxConnections}), ` +
        `leaving less than the reserved connection headroom ` +
        `for migrations, admin tools, and backup jobs. Set DB_POOL_INSTANCES to ` +
        `include all Node processes across Render services, and DB_OTHER_CONNECTIONS ` +
        `to the aggregate Go Worker/cron/other non-Prisma pool maximums. ` +
        `Set PM2_INSTANCES explicitly when the platform allocation differs from the ` +
        `host CPU count, and configure connection_limit to match the service's pool budget.`,
      { instances, connectionLimit, estimatedNodeTotal, estimatedOtherConnections, estimatedTotal, threshold, maxConnections }
    );
  } else {
    logger.info(
      `DB connection capacity check passed: ${instances} Node instances × ` +
        `connection_limit=${connectionLimit} = ${estimatedNodeTotal}, plus ` +
        `${estimatedOtherConnections} non-Prisma connections = ${estimatedTotal} ` +
        `(within configured max_connections=${maxConnections})`
    );
  }
}
