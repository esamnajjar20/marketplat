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

// BUGFIX (found during a post-implementation code audit): a `.catch()`
// chained onto a call only handles that call's promise REJECTING — it
// does nothing if the call throws synchronously instead (e.g. a client
// library throwing before it ever returns a promise, such as when
// called on a torn-down/disconnected connection). `checkOk` wraps the
// call itself in try/catch so both failure modes — async rejection and
// sync throw — resolve to `false` the same way, instead of a sync
// throw escaping Promise.all entirely and rejecting performCheck().
const checkOk = async (fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
};

const performCheck = async (): Promise<HealthStatus> => {
  try {
    const [dbOk, redisOk] = await Promise.all([
      checkOk(() => prisma.$queryRaw`SELECT 1`),
      checkOk(() => redis.ping()),
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
    // every real failure source (DB down, Redis down, or a synchronous
    // throw) is already caught internally by the two `checkOk()` calls
    // above — but if a future change ever introduced a code path between
    // Promise.all and the return that could throw, inflightCheck would be left pointing
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
