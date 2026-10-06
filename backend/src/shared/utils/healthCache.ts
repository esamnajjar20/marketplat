import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';

interface HealthStatus {
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  checkedAt: string;
}

let cachedStatus: HealthStatus | null = null;
let lastCheckTime = 0;
// was a hardcoded 30_000 (30s) — see env.ts's
// HEALTH_CACHE_DURATION_MS comment for the full rationale. Now
// configurable, defaulting to 8s.
const CACHE_DURATION = env.health.cacheDurationMs;

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
// T582 — bounds each readiness check so a hung DB/Redis connection
// cannot leave performCheck's Promise.all pending forever. Previously
// a socket that accepted a TCP connection but never responded would
// leave inflightCheck permanently non-null (performCheck's own
// finally resets it only after Promise.all settles) — /ready then
// answers "not ready" from the stale cached status until the process
// restarts, even after the dependency recovers. 2s is generous for
// SELECT 1 / PING on a healthy connection and short enough that
// /ready reflects a real outage quickly. Redis's own client already
// has maxRetriesPerRequest=3 and its own socket timeouts, but this
// guard applies to both checks uniformly and also covers Prisma,
// which has no built-in per-query timeout.
const HEALTH_CHECK_TIMEOUT_MS = 2_000;

const checkOkWithTimeout = async (fn: () => Promise<unknown>): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('health check timed out')),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    timer.unref();
  });
  try {
    await Promise.race([fn(), timeoutPromise]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const performCheck = async (): Promise<HealthStatus> => {
  try {
    const [dbOk, redisOk] = await Promise.all([
      checkOkWithTimeout(() => prisma.$queryRaw`SELECT 1`),
      checkOkWithTimeout(() => redis.ping()),
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
