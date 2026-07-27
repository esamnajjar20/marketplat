/**
 * src/instrument.ts
 *
 * Sentry MUST be initialized before any other module in this app is
 * imported — the Node SDK's auto-instrumentation (Express, Prisma,
 * Redis, HTTP) patches those libraries at import time, and any module
 * that's already been imported before Sentry.init() runs won't be
 * correctly instrumented. This is why this file exists standalone
 * rather than folding Sentry.init() into config/env.ts or app.ts: it
 * must be the literal first import in server.ts, before ../config/env,
 * before ../app, before anything.
 *
 * Deliberately reads process.env directly here instead of importing
 * config/env.ts's validated `env` object — importing that module
 * would itself violate "before any other module," even though env.ts
 * is otherwise this app's single source of truth for configuration.
 * (env.ts's SENTRY_DSN/SENTRY_TRACES_SAMPLE_RATE fields exist so OTHER
 * modules, e.g. a future health-check payload, can read Sentry's
 * configured state without reaching into process.env themselves — this
 * file is the one deliberate exception to "always go through env.ts.")
 *
 * Same "opt-in, app works identically without it" pattern as the
 * webhook transport in shared/utils/logger.ts: with no SENTRY_DSN set,
 * this file does nothing and the app behaves exactly as it did before
 * this file existed. See logger.ts's own comment for why that fallback
 * transport still exists alongside this — Sentry is the recommended
 * path now that it's wired up for real, but the vendor-agnostic webhook
 * option remains for anyone who wants a different APM without touching
 * code.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  const rawSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE;
  const parsedSampleRate = rawSampleRate ? parseFloat(rawSampleRate) : NaN;
  // Falls back to a conservative 0.1 (10%) rather than 1.0 (100%) if
  // unset or unparseable — tracing every single request in production
  // has a real cost (both Sentry quota and a small perf overhead per
  // request), and defaulting to "trace everything" silently is the
  // wrong failure mode for a value nobody explicitly configured yet.
  const tracesSampleRate =
    Number.isFinite(parsedSampleRate) && parsedSampleRate >= 0 && parsedSampleRate <= 1
      ? parsedSampleRate
      : 0.1;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate,
    // FIX APM-02: PII scrubbing. This app's own JWT payloads, auth
    // cookies, and password fields must never leave this process even
    // in an error report — sendDefaultPii defaults to false in current
    // SDK versions, but stated explicitly here so a future SDK default
    // change can't silently start sending more than intended without
    // this line visibly needing to change too.
    sendDefaultPii: false,
    beforeSend(event) {
      // Extra belt-and-suspenders scrub on top of sendDefaultPii:false —
      // strips Authorization headers and any cookie header from the
      // request context Sentry attaches to an error event, in case a
      // future integration or manual Sentry.captureException call
      // attaches request data that would otherwise include them.
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }
      return event;
    },
  });
}

export { Sentry };
