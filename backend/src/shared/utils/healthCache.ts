import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';

interface HealthStatus {
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  checkedAt: string;
}

let cachedStatus: HealthStatus | null = null;
let lastCheckTime = 0;
const CACHE_DURATION = 30_000;

// Promise Deduplication — طلب واحد فقط يضرب DB+Redis
let inflightCheck: Promise<HealthStatus> | null = null;

const performCheck = async (): Promise<HealthStatus> => {
  try {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis
        .ping()
        .then(() => true)
        .catch(() => false),
    ]);

    cachedStatus = {
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      checkedAt: new Date().toISOString(),
    };
    lastCheckTime = Date.now();
    return cachedStatus;
  } finally {
    // BUGFIX (found during a post-implementation code audit): previously
    // `inflightCheck = null` only ran on the success path, right before
    // `return`. In practice performCheck() never actually rejects today —
    // every real failure source (DB down, Redis down) is already caught
    // internally by the two `.catch(() => false)` calls above — but if a
    // future change ever introduced a code path between Promise.all and
    // the return that could throw, inflightCheck would be left pointing
    // at a permanently-rejected Promise forever. Every subsequent call to
    // getCachedReadiness() would then reuse that same rejected Promise
    // indefinitely (see the `if (inflightCheck) return inflightCheck`
    // check below) — permanently breaking /ready with 503s even after
    // Postgres/Redis recovered, until the process was restarted. `finally`
    // guarantees this resets on every path, not just the success one.
    inflightCheck = null;
  }
};

export const getCachedReadiness = async (): Promise<HealthStatus> => {
  if (cachedStatus && Date.now() - lastCheckTime < CACHE_DURATION) {
    return cachedStatus;
  }
  if (inflightCheck) return inflightCheck;
  inflightCheck = performCheck();
  return inflightCheck;
};
