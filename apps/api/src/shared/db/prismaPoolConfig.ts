/**
 * Build the runtime DATABASE_URL used by each PrismaClient process.
 * Prisma's default pool size is CPU-derived; with several Render services and
 * PM2 workers it can silently allocate more connections than Postgres allows.
 */
export function buildPrismaDatabaseUrl(
  databaseUrl: string,
  connectionLimit: number,
  poolTimeoutSeconds: number,
  applicationName = 'marketplat-api'
): string {
  if (!Number.isSafeInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 100) {
    throw new Error('DB_CONNECTION_LIMIT must be an integer between 1 and 100.');
  }
  if (!Number.isSafeInteger(poolTimeoutSeconds) || poolTimeoutSeconds < 1 || poolTimeoutSeconds > 300) {
    throw new Error('DB_POOL_TIMEOUT_SECONDS must be an integer between 1 and 300.');
  }
  if (typeof applicationName !== 'string' || !/^[A-Za-z0-9_.-]{1,63}$/.test(applicationName)) {
    throw new Error('DB_APPLICATION_NAME must contain 1–63 ASCII letters, digits, dots, underscores, or hyphens.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql:// or postgres:// protocol.');
  }

  parsed.searchParams.set('connection_limit', String(connectionLimit));
  parsed.searchParams.set('pool_timeout', String(poolTimeoutSeconds));
  parsed.searchParams.set('application_name', applicationName);
  return parsed.toString();
}
