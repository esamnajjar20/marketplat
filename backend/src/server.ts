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
import { redisMemoryMonitor } from './shared/utils/redisMemoryMonitor';
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

    checkConnectionCapacity(env.database.url);
    await withRetry('Database (Postgres)', () => prisma.$connect());
    logger.info('✅ Database connected');
    await withRetry('Redis', () => redis.ping());
    logger.info('✅ Redis connected');
    viewsBuffer.startFlushTimer();
    // PROD-FIX-11: starts polling Redis's own INFO memory every 30s —
    // see redisMemoryMonitor.ts for why this matters given
    // docker-compose.yml's noeviction policy.
    redisMemoryMonitor.start();

    const server = app.listen(env.port, () => {
      logger.info('🚀 Server running', {
        port: env.port,
        env: env.nodeEnv,
        url: `http://localhost:${env.port}`,
        docs: `http://localhost:${env.port}/api/docs`,
      });
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);

      // M-08: .unref() prevents the timer from keeping the event loop alive
      // if the server closes cleanly before 10s
      const forceTimer = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000);
      forceTimer.unref();

      server.close(async () => {
        clearTimeout(forceTimer);
        // FIX D-12: previously the views buffer's flush timer was never
        // stopped on shutdown, so up to 60s of buffered view-count
        // increments sat in Redis until the *next* process's timer
        // happened to pick them up. stopFlushTimer() performs a final
        // flush, so a clean deploy/restart doesn't leave a window where
        // Redis and Postgres views are out of sync longer than necessary.
        await viewsBuffer.stopFlushTimer();
        redisMemoryMonitor.stop();
        await prisma.$disconnect();
        await redis.quit();
        logger.info('Server closed cleanly');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
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
          redisMemoryMonitor.stop();
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
    await prisma.$disconnect();
    process.exit(1);
  }
};

void bootstrap();
