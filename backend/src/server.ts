import { reportBackgroundFailure } from './shared/utils/backgroundTask';
// FIX APM-02: must be the literal first import — see instrument.ts's
// own header comment for why Sentry.init() has to run before any other
// module (including ./app and its own transitive imports) is loaded.
import './instrument';

import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import { logger } from './shared/utils/logger';
import { viewsBuffer } from './shared/utils/viewsBuffer';
import {
  initUserCacheInvalidationSubscriber,
  stopUserCacheInvalidationSubscriber,
} from './shared/utils/userCache';
import {
  initUnreadNotificationsCacheInvalidationSubscriber,
  stopUnreadNotificationsCacheInvalidationSubscriber,
} from './shared/utils/unreadNotificationsCache';
import {
  initBlacklistInvalidationSubscriber,
  stopBlacklistInvalidationSubscriber,
} from './shared/utils/tokenStore';
import { activityBuffer } from './shared/utils/activityBuffer';
import { redisMemoryMonitor } from './shared/utils/redisMemoryMonitor';
import { startCacheKeepWarm } from './shared/utils/cacheWarmup';
import { checkConnectionCapacity } from './shared/utils/capacityCheck';

// TERMUX/PROOT SUPPORT: on Android + Termux + proot-distro Ubuntu,
// Postgres and Redis are typically started manually by the person
// (`pg_ctlcluster start` / `redis-server &`) rather than by a process
// supervisor with readiness checks (systemd, Docker healthcheck, etc.),
// so it's common for `npm run dev`/`npm start` to be launched a moment
// before either service has actually finished accepting connections.
// The original single-attempt `await prisma.$connect()` / `await
// redis.ping()` would crash the whole process on that first race
// instead of just waiting a beat — this retries a few times with a
// short backoff before giving up for real, without masking a genuine
// "service isn't running at all" failure (it still throws after the
// window, with a clear message either way).
async function withRetry(
  label: string,
  fn: () => Promise<unknown>,
  attempts = 5,
  delayMs = 1500
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt === attempts) {
        logger.error(
          `${label} did not become reachable after ${attempts} attempts. ` +
            `If you're running this on Termux/proot Ubuntu, confirm Postgres ` +
            `and Redis are actually started (see docs/TERMUX_SETUP.md) before ` +
            `running the server.`,
          { error: error instanceof Error ? error.message : error }
        );
        throw error;
      }
      logger.warn(
        `${label} not reachable yet (attempt ${attempt}/${attempts}) — retrying in ${delayMs}ms...`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

const bootstrap = async (): Promise<void> => {
  try {
    // PROD-FIX-10: SENTRY_DSN is optional (instrument.ts is a no-op
    // without it, same pattern as CLOUDINARY_*/SMTP_*), which is fine
    // for local/test — but in production, that silently means there is
    // NO error tracking at all beyond whatever's in the Winston logs
    // (see logger.ts), which nobody is guaranteed to be watching in
    // real time. This doesn't block startup (a deliberate choice not
    // to use Sentry, or an APM configured through some other channel,
    // are both legitimate), it just makes the gap visible in the boot
    // logs instead of being discoverable only after the first
    // production incident nobody got paged for.
    if (env.nodeEnv === 'production' && !env.observability.sentryDsn) {
      logger.warn(
        '⚠️  Running in production with no SENTRY_DSN set — errors will only be ' +
        'visible in application logs, with no external error tracking/alerting. ' +
        'Set SENTRY_DSN (see .env.example) or confirm an equivalent APM is already ' +
        'in place before relying on this deployment.',
      );
    }

    // PROD-FIX: CLOUDINARY_* are `.optional()` in env.ts (same class of
    // gap as SENTRY_DSN above), but unlike Sentry, image upload is core
    // functionality (ad photos, avatars, store logos/covers) that every
    // user hits immediately. Missing/blank creds don't fail here — they
    // fail per-request the first time someone uploads an image, as an
    // opaque 500. Surface it loudly at boot instead of discovering it
    // from a pile of "Image upload failed" errors in production.
    if (!env.cloudinary.isConfigured) {
      logger.warn(
        '⚠️  CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET ' +
        'are not fully set — every image upload (ad photos, avatars, store logos/covers) ' +
        'will fail at request time. Set all three (see .env.example) before relying on ' +
        'this deployment for uploads.',
      );
    }

    // FIX TRUST-PROXY-RANGE-01: env.ts's schema now rejects values
    // outside 0-5 at boot, but 0 in production is a *legal* value that
    // is nevertheless never the right one when any reverse proxy sits
    // in front of this process. Render (this app's target host)
    // terminates TLS at its edge and forwards internally, so with
    // TRUST_PROXY=0 every request arrives with req.ip = Render's own
    // LB address. The consequence is subtle and dangerous: the per-IP
    // login rate limit (MAX_IP_ATTEMPTS in auth.service.ts) becomes a
    // single shared bucket for every user on the internet — the first
    // 50 failed attempts, from anyone, lock out everyone. Same story
    // for every audit log / security alert that records an IP. This
    // warns loudly at boot rather than failing — TRUST_PROXY=0 is
    // still the correct value on a bare local dev box, and we have no
    // reliable way to know from inside the process whether something
    // is proxying us.
    if (env.nodeEnv === 'production' && env.security.trustProxy === 0) {
      logger.warn(
        '⚠️  TRUST_PROXY=0 in production — req.ip will be the address of the ' +
        'reverse proxy in front of this process (e.g. Render\'s internal LB), ' +
        'identical for every user. Per-IP rate limiting, lockouts, and audit ' +
        'logs will all be wrong. Set TRUST_PROXY=1 (Render / single nginx hop), ' +
        '2 (Cloudflare in front of Render), or higher to match your topology. ' +
        'See env.ts\'s TRUST_PROXY comment for the full range rationale.',
      );
    }

    checkConnectionCapacity(env.database.url);
    await withRetry('Database (Postgres)', () => prisma.$connect());
    logger.info('✅ Database connected');
    await withRetry('Redis', () => redis.ping());
    logger.info('✅ Redis connected');
    // PM2 cluster mode: subscribe THIS worker to the user-cache
    // invalidation channel BEFORE the first request is served, so an
    // invalidate() on another worker (ban / deactivation) drops this
    // worker's in-process L1 entry immediately instead of after the
    // 30s L1 TTL. See userCache.ts's "Cross-worker L1 invalidation"
    // comment for the full auth-bypass reasoning.
    initUserCacheInvalidationSubscriber();
    initUnreadNotificationsCacheInvalidationSubscriber();
    initBlacklistInvalidationSubscriber();
    viewsBuffer.startFlushTimer();
    // FIX OPS-1.1: same buffer-then-flush pattern as viewsBuffer above,
    // for user activity writes — see activityBuffer.ts's own doc
    // comment for why it flushes on a much shorter 5s interval.
    activityBuffer.startFlushTimer();
    // PROD-FIX-11: starts polling Redis's own INFO memory every 30s —
    // see redisMemoryMonitor.ts for why this matters given
    // docker-compose.yml's noeviction policy.
    redisMemoryMonitor.start();

    // FIX CACHE-KEEPWARM-01: stopped on shutdown (see below).
    let stopCacheKeepWarm: (() => void) | undefined;
    // Phase 3: set once the (optional) notification worker has started.
    let stopNotificationQueue: (() => Promise<void>) | undefined;
    // FIX-NOTIF-SHUTDOWN-01: held so shutdown can await the import BEFORE
    // reading stopNotificationQueue. A SIGTERM during startup would otherwise
    // skip it and leak the worker past server.close().
    let notificationQueueStartup: Promise<void> | undefined;

    const server = app.listen(env.port, () => {
      logger.info('🚀 Server running', {
        port: env.port,
        env: env.nodeEnv,
        url: `http://localhost:${env.port}`,
        docs: `http://localhost:${env.port}/api/docs`,
      });
      // FIX CACHE-WARMUP-01 / CACHE-KEEPWARM-01: fill the public Redis caches
      // before the first visitor has to, and keep them warm afterwards —
      // see shared/utils/cacheWarmup.ts.
      stopCacheKeepWarm = startCacheKeepWarm();
      // Phase 3: queue consumer (no-op unless NOTIFICATION_QUEUE_ENABLED=true).
      // A failure to start must never take the API down — pushes then simply
      // stay queued until a worker is healthy, and producers fall back inline.
      // Dynamic import: when the queue is off, `bullmq` is never even loaded,
      // so an environment without the package keeps booting exactly as before.
      if (env.notificationQueue.enabled) {
        // FIX-NOTIF-SHUTDOWN-01: keep the promise (never void) so shutdown can
        // await it — see notificationQueueStartup's own comment.
        notificationQueueStartup = import('./shared/queue/notificationQueue')
          .then((q) => {
            q.startNotificationWorker();
            stopNotificationQueue = q.stopNotificationQueue;
          })
          .catch((err) => {
            logger.error('Failed to start notification worker', { err });
          });
      }
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      stopCacheKeepWarm?.();

      // M-08: .unref() prevents the timer from keeping the event loop alive
      // if the server closes cleanly before 10s
      const forceTimer = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000);
      forceTimer.unref();

      server.close(async () => {
        clearTimeout(forceTimer);
        // Flush buffered views during shutdown so Redis/Postgres do not diverge
        // until the next process starts.
        await viewsBuffer.stopFlushTimer();
        // Flush buffered activity during shutdown to avoid losing the pending
        // batch between process restarts.
        await activityBuffer.stopFlushTimer();
        // Finish in-flight notification jobs while Prisma/Redis are still available.
        await notificationQueueStartup?.catch((error) => reportBackgroundFailure('backend/src/server.ts', error));
        await stopNotificationQueue?.();
        redisMemoryMonitor.stop();
        stopUserCacheInvalidationSubscriber();
        stopUnreadNotificationsCacheInvalidationSubscriber();
        stopBlacklistInvalidationSubscriber();
        await prisma.$disconnect();
        await redis.quit();
        logger.info('Server closed cleanly');
        process.exit(0);
      });
    };

    // FIX SHUTDOWN-SSE-01: server.close() waits for every active
    // connection to end before firing its callback. The
    // /notifications/stream SSE endpoint is a long-lived
    // text/event-stream connection with no natural end, so on a
    // graceful shutdown Node stayed in server.close() until the 10s
    // forceTimer fired and killed the process with exit code 1 — every
    // deploy on Render was paying the full 10s and surfacing as an
    // unclean shutdown in monitoring. closeIdleConnections() has been
    // available since Node 18.2; closeAllConnections() is the
    // documented nuclear option (drops in-flight sockets too). Called
    // via optional chaining so a Node version without them still runs
    // — the original forceTimer still bounds the worst case.
    const drainConnections = (srv: typeof server) => {
      const withIdle = srv as typeof server & {
        closeIdleConnections?: () => void;
        closeAllConnections?: () => void;
      };
      withIdle.closeIdleConnections?.();
      // Give in-flight requests ~3s to finish, then drop everything
      // (this is what actually ends the SSE stream). Force exit still
      // guards the case where closeAllConnections itself hangs.
      setTimeout(() => withIdle.closeAllConnections?.(), 3000).unref();
    };

    // T531 — guard against a duplicate signal (e.g. SIGTERM arriving
    // while a SIGINT handler is still draining): without this, both
    // drainConnections() (two closeAllConnections timers) and
    // shutdown() (two server.close callbacks each running the full
    // prisma.$disconnect + redis.quit + stopFlushTimer chain) would
    // fire. Most of the cleanup is idempotent, but stopFlushTimer's
    // final flush and prisma.$disconnect are not designed to be called
    // twice — a second flush() after disconnect would fail noisily in
    // the logs on every double-signal shutdown. Rare in practice
    // (Render sends one SIGTERM per deploy) but free to guard.
    let shuttingDown = false;
    const triggerShutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      drainConnections(server);
      void shutdown(signal);
    };

    process.on('SIGTERM', () => triggerShutdown('SIGTERM'));
    process.on('SIGINT', () => triggerShutdown('SIGINT'));
    process.on('unhandledRejection', reason => logger.error('Unhandled rejection', reason));

    // FIX D-13: previously this called process.exit(1) immediately with
    // zero cleanup — no final views flush, no prisma.$disconnect(), no
    // draining of in-flight requests. A single uncaught error anywhere
    // killed everything instantly, which can leave DB connections
    // unreleased (pool/PgBouncer pressure) right when something has
    // already gone wrong, compounding an incident instead of containing
    // it. Now it attempts the same bounded cleanup as a graceful
    // shutdown, with a short forced-exit timeout as a safety net in case
    // cleanup itself hangs (e.g. a wedged Redis/DB connection).
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception', error);

      const forceExitTimer = setTimeout(() => {
        logger.error('Forced exit after uncaughtException cleanup timeout');
        process.exit(1);
      }, 5_000);
      forceExitTimer.unref();

      void (async () => {
        try {
          await viewsBuffer.stopFlushTimer();
          await activityBuffer.stopFlushTimer();
          // FIX-NOTIF-SHUTDOWN-01: see the other shutdown site.
          await notificationQueueStartup?.catch((error) => reportBackgroundFailure('backend/src/server.ts', error));
          await stopNotificationQueue?.();
          redisMemoryMonitor.stop();
          stopUserCacheInvalidationSubscriber();
          stopUnreadNotificationsCacheInvalidationSubscriber();
          stopBlacklistInvalidationSubscriber();
          await prisma.$disconnect();
          await redis.quit();
        } catch (cleanupError) {
          logger.error('Cleanup after uncaughtException failed', cleanupError);
        } finally {
          clearTimeout(forceExitTimer);
          process.exit(1);
        }
      })();
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    // T530 — $disconnect() on a client that never completed $connect()
    // can throw, which would itself become an unhandledRejection from
    // inside bootstrap's own catch. Fire-and-forget with its own guard,
    // then exit unconditionally.
    try {
      await prisma.$disconnect();
    } catch (disconnectErr) {
      logger.error('Failed to disconnect Prisma during bootstrap failure', disconnectErr);
    }
    process.exit(1);
  }
};

void bootstrap();
