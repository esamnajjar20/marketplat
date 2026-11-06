import { PrismaClient } from '@prisma/client';
import { recordPrismaQuery } from '../shared/utils/dbQueryTelemetry';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbQueryMetricsMiddlewareInstalled?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'test'
        ? []
        : process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}


// Record low-cardinality database metrics without exposing SQL or bound values.
// Set DB_QUERY_METRICS_ENABLED=0 only for emergency rollback; metrics are
// enabled by default in development and production.
if (
  process.env.NODE_ENV !== 'test' &&
  process.env.DB_QUERY_METRICS_ENABLED !== '0' &&
  !globalForPrisma.dbQueryMetricsMiddlewareInstalled
) {
  prisma.$use(async (params, next) => {
    const startedAt = process.hrtime.bigint();
    try {
      return await next(params);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      recordPrismaQuery(params.model, params.action, params.args, durationMs);
    }
  });
  globalForPrisma.dbQueryMetricsMiddlewareInstalled = true;
}
