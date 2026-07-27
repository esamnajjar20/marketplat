import winston from 'winston';
import Transport from 'winston-transport';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { Sentry } from '../../instrument';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(meta).length > 0) log += `\n${JSON.stringify(meta, null, 2)}`;
  if (stack) log += `\n${stack}`;
  return log;
});

const isDev = process.env.NODE_ENV !== 'production';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev
      ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat)
      : combine(timestamp(), errors({ stack: true }), json()),
  }),
];

if (!isDev) {
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      format: combine(timestamp(), json()),
    })
  );
}

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  transports,
  exitOnError: false,
});

/**
 * FIX D-22: previously every `logger.error(...)` call across the codebase
 * (the sitemap-equivalent silent failures, views-buffer flush errors,
 * the error middleware's catch-all, etc.) only ever reached
 * stdout/the rotating log files. Without a shipping/aggregation layer
 * or an error tracker, none of that is actionable beyond manually
 * reading container logs — several issues found in earlier audit
 * passes would have been invisible in production without one.
 *
 * Implemented as a Winston transport (not a monkey-patched method) so
 * it hooks into every log call through Winston's own dispatch — the
 * idiomatic extension point — without reassigning logger.error or
 * fighting Winston's TypeScript types.
 *
 * FIX APM-02: a real @sentry/node integration now exists below this
 * block (see SentryErrorReporterTransport) — this generic webhook
 * transport is KEPT alongside it, not replaced, as a vendor-agnostic
 * option for anyone who wants a different destination (a custom
 * alerting endpoint, an internal Slack/PagerDuty bridge, or even
 * Sentry's own webhook-style ingest as an alternative to the SDK) without
 * touching code — set ERROR_REPORTER_WEBHOOK_URL to any HTTPS endpoint
 * and every error-level log is also POSTed there as JSON, independent
 * of whether SENTRY_DSN is also configured.
 *
 * If ERROR_REPORTER_WEBHOOK_URL is unset (the default), this transport
 * is simply never added — behavior is unchanged from before this fix.
 */
const errorReporterUrl = process.env.ERROR_REPORTER_WEBHOOK_URL;

if (errorReporterUrl) {
  class WebhookErrorReporterTransport extends Transport {
    log(info: winston.LogEntry, callback: () => void) {
      const payload = JSON.stringify({
        level: info.level,
        message: info.message,
        meta: { ...info, level: undefined, message: undefined },
        timestamp: new Date().toISOString(),
        service: 'classifieds-backend',
        environment: process.env.NODE_ENV,
      });

      // Fire-and-forget — never let error reporting itself throw or
      // block the logger. fetch is available globally in Node 18+.
      fetch(errorReporterUrl as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {
        // Intentionally swallowed — if the error reporter itself is
        // down, that's not something the app's own error path should
        // fail on.
      });

      callback();
    }
  }

  logger.add(new WebhookErrorReporterTransport({ level: 'error', format: errors({ stack: true }) }));
}

/**
 * FIX APM-02: real Sentry integration, as a Winston transport — same
 * extension point as the webhook transport above, so every existing
 * `logger.error(...)` call site across the codebase (error.middleware.ts's
 * catch-all, server.ts's uncaughtException/unhandledRejection handlers,
 * viewsBuffer's flush-failure logging, etc.) automatically reaches
 * Sentry too, with zero changes needed at any of those call sites.
 *
 * Only added if instrument.ts actually initialized Sentry (i.e.
 * SENTRY_DSN was set) — Sentry.captureException on an uninitialized
 * SDK is a documented no-op, not an error, but this transport is kept
 * conditional anyway so `logger.add()` isn't called at all when Sentry
 * isn't configured, matching the same "does nothing extra when unset"
 * contract the webhook transport above already has.
 *
 * Runs ALONGSIDE the webhook transport, not instead of it — a team
 * could have both configured (e.g. Sentry for error tracking, a
 * separate Slack/PagerDuty webhook for a different alerting need)
 * without conflict, since Winston dispatches to every added transport
 * independently.
 */
if (process.env.SENTRY_DSN) {
  class SentryErrorReporterTransport extends Transport {
    log(info: winston.LogEntry, callback: () => void) {
      const { level, message, stack, ...meta } = info;

      // FIX APM-03: winston.createLogger() itself has no base-level
      // `format` — errors({ stack: true }) is only applied per-transport
      // (see the Console/DailyRotateFile transports above, each of
      // which sets it explicitly). A transport added via logger.add()
      // with no format of its own would NOT get a populated `stack`
      // field even when a real Error was logged, silently falling
      // through to captureMessage every time — which is exactly why
      // this transport is constructed below with its own explicit
      // `format: errors({ stack: true })`, not relying on some assumed
      // global default that doesn't actually exist in this file.
      //
      // FIX APM-04: even with that format applied, Winston's errors()
      // formatter ONLY auto-detects an Error passed directly as an
      // argument (e.g. logger.error('msg', someError) — the pattern
      // server.ts, adminStatsCache.ts, and viewsBuffer.ts use) — it does
      // NOT reach into a metadata object to find one (e.g.
      // logger.error('msg', { err, otherField }) — the pattern
      // securityAlert.ts, auditLog.ts, userCache.ts, and
      // emailService.ts actually use, which is most call sites in this
      // codebase). Without the fallback below, all of THOSE calls would
      // silently lose their stack trace and get reported to Sentry as a
      // bare message, unable to properly group/deduplicate by
      // exception. This checks meta.err / meta.error for a real Error
      // instance as a fallback, so both real conventions already in use
      // across this codebase are handled correctly, rather than
      // quietly degrading half of them.
      const nestedError =
        meta.err instanceof Error ? meta.err : meta.error instanceof Error ? meta.error : undefined;

      if (stack && typeof message === 'string') {
        const reconstructedError = new Error(message);
        reconstructedError.stack = stack as string;
        Sentry.captureException(reconstructedError, { extra: meta });
      } else if (nestedError) {
        Sentry.captureException(nestedError, {
          extra: { ...meta, loggedMessage: message },
        });
      } else {
        Sentry.captureMessage(typeof message === 'string' ? message : JSON.stringify(message), {
          level: level === 'error' ? 'error' : 'warning',
          extra: meta,
        });
      }

      callback();
    }
  }

  logger.add(new SentryErrorReporterTransport({ level: 'error', format: errors({ stack: true }) }));
}
