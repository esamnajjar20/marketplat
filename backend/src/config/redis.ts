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
  // FIX DEPLOY-03: Upstash (and most managed Redis providers) require
  // TLS on every plan — the `rediss://` scheme / "TLS/SSL: Enabled" in
  // Upstash's dashboard is not optional. ioredis does not infer TLS
  // from a host/port pair; without an explicit `tls` option it opens a
  // plain TCP socket and attempts a plaintext Redis handshake against a
  // server expecting a TLS handshake. That mismatch is what produced
  // the repeating "Redis connected" -> immediate "read ECONNRESET"
  // cycle seen in production: some connection attempts partially
  // complete before the server rejects the plaintext protocol, which
  // looks like intermittent flakiness but is actually a deterministic
  // protocol mismatch on every single connection attempt. An empty
  // object is sufficient here — it enables TLS using Node's default
  // secure context, which is correct for Upstash's publicly-trusted
  // certificate; no custom CA or servername override is needed.
  tls: {},
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => logger.info("✅ Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { err: err.message }));
