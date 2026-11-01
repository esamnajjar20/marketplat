/** Crash reporting adapter backed by Sentry when a DSN is configured. */
import * as Sentry from '@sentry/react-native';
import { logger } from '@/lib/logger';

type ErrorReporter = {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, context?: Record<string, unknown>) => void;
};

let reporter: ErrorReporter | null = null;
let initialized = false;
let sentryEnabled = false;

export type InitErrorReportingOptions = {
  dsn?: string;
  custom?: ErrorReporter;
};

const PRIVATE_KEY = /(authorization|access.?token|refresh.?token|csrf|password|cookie|secret|credential|email|phone|fcm.?token|device.?token|request.?body|message.?body)/i;
const PRIVATE_TEXT = /(?:Bearer\s+)[A-Za-z0-9._~+\/-]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function scrubText(value: string): string {
  return value.replace(PRIVATE_TEXT, '[REDACTED]');
}

function scrubValue(value: unknown, key = '', depth = 0): unknown {
  if (PRIVATE_KEY.test(key)) return '[REDACTED]';
  if (depth > 5) return '[TRUNCATED]';
  if (typeof value === 'string') return scrubText(value.slice(0, 2_000));
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => scrubValue(item, '', depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([childKey, childValue]) => [
      childKey,
      scrubValue(childValue, childKey, depth + 1),
    ]));
  }
  return undefined;
}

export function initErrorReporting(options: InitErrorReportingOptions = {}): void {
  if (initialized && !options.custom) return;
  initialized = true;
  reporter = options.custom ?? null;
  sentryEnabled = false;

  if (options.custom) {
    logger.info('error-reporting', 'Custom error reporter initialized');
    return;
  }

  const dsn = options.dsn?.trim();
  if (!dsn) {
    logger.info('error-reporting', 'Crash reporting disabled: no Sentry DSN configured');
    return;
  }

  try {
    Sentry.init({
      dsn,
      enabled: true,
      environment: __DEV__ ? 'development' : 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        // Native HTTP request details can contain bearer/cookie headers and
        // request bodies. Drop them rather than relying only on key matching.
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
          delete event.request.data;
          if (event.request.url) {
            try {
              const parsed = new URL(event.request.url);
              parsed.search = '';
              parsed.hash = '';
              event.request.url = parsed.toString();
            } catch {
              event.request.url = '[REDACTED]';
            }
          }
        }
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
          delete event.user.id;
        }
        if (event.message) event.message = scrubText(event.message);
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map((exception) => ({
            ...exception,
            value: exception.value ? scrubText(exception.value) : exception.value,
          }));
        }
        if (event.tags) event.tags = scrubValue(event.tags) as typeof event.tags;
        if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
        if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.slice(-30).map((breadcrumb) => ({
            ...breadcrumb,
            message: breadcrumb.message ? scrubText(breadcrumb.message) : breadcrumb.message,
            data: breadcrumb.data ? scrubValue(breadcrumb.data) as typeof breadcrumb.data : breadcrumb.data,
          }));
        }
        return event;
      },
    });
    sentryEnabled = true;
    logger.info('error-reporting', 'Sentry native crash reporting initialized');
  } catch (error) {
    sentryEnabled = false;
    logger.error('error-reporting', 'Sentry initialization failed; local logging remains enabled', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('error-reporting', message, context);
  try {
    if (reporter) reporter.captureException(error, context);
    else if (sentryEnabled) {
      Sentry.withScope((scope) => {
        if (context) scope.setExtras(scrubValue(context) as Record<string, unknown>);
        Sentry.captureException(error);
      });
    }
  } catch {
    /* Reporting must never crash the application. */
  }
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  logger.warn('error-reporting', message, context);
  try {
    if (reporter) reporter.captureMessage(message, context);
    else if (sentryEnabled) {
      Sentry.withScope((scope) => {
        if (context) scope.setExtras(scrubValue(context) as Record<string, unknown>);
        Sentry.captureMessage(scrubText(message));
      });
    }
  } catch {
    /* Reporting must never crash the application. */
  }
}
