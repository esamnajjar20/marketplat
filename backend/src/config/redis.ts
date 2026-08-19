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
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => logger.info("✅ Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { err: err.message }));
