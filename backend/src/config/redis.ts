import Redis from "ioredis";
import { logger } from "../shared/utils/logger";
import { env } from "./env";

export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password || undefined,
  lazyConnect: true,
  // FIX DEPLOY-01: previously no connectTimeout was set, so an
  // unreachable host (e.g. REDIS_HOST misconfigured/pointing at a
  // service that doesn't exist on the network) left the underlying TCP
  // connect() attempt hanging indefinitely — ioredis only starts its
  // retryStrategy backoff *after* an attempt actually fails, so with no
  // timeout an attempt that never resolves means retryStrategy never
  // even runs. server.ts's own withRetry() wraps redis.ping() expecting
  // a rejected promise to retry against, but with the connect itself
  // stuck, that await never settles either way — no warning is logged,
  // no error is thrown, and the process just hangs before ever reaching
  // app.listen(), which is invisible to PM2 (the process is alive, just
  // stuck) and shows up externally as a platform-level "connection
  // refused" with no clear cause in the app's own logs. 10s bounds a
  // single connection attempt so a real failure surfaces quickly and
  // predictably instead of hanging.
  connectTimeout: 10_000,
  // FIX DEPLOY-02: on Railway, all PM2 cluster workers boot within
  // milliseconds of each other and each opens a Redis connection
  // immediately on startup. A small/shared Redis plan can't absorb
  // that connection burst in its first moment alive (or the backend's
  // first moment alive, if both services cold-start together) and
  // resets the earliest attempts with ECONNRESET — this is transient
  // startup contention, not a real network/host problem, and normally
  // clears within ~1-2s on its own (see the run of "Redis connected"
  // successes immediately following the resets in deploy logs).
  // Previously retryStrategy's backoff (50ms, 100ms, 150ms...) burned
  // through maxRetriesPerRequest's 3-attempt budget in under 300ms —
  // faster than the burst typically clears — so a worker could exhaust
  // its retries and exit (PM2 SIGINT) before ever getting a real shot
  // at a stable connection. Widening the early backoff steps (200ms,
  // 400ms, 600ms) buys the burst more time to clear without changing
  // behavior for a genuinely unreachable host — retryStrategy still
  // caps at 2s per attempt and connectTimeout still bounds each
  // attempt, so a real outage still surfaces within the same overall
  // timeframe as before, just via slightly fewer, better-spaced tries.
  retryStrategy: (times) => Math.min(times * 200, 2000),
  maxRetriesPerRequest: 5,
});

redis.on("connect", () => logger.info("✅ Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { err: err.message }));
