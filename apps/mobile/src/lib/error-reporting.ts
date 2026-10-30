/**
 * طبقة إبلاغ أخطاء موحّدة.
 *
 * لا يتم استيراد Sentry في وقت البناء قبل إضافته فعليًا إلى workspace/lockfile.
 * يمكن تمرير reporter من تهيئة native بعد تثبيت SDK؛ وبدون ذلك يبقى التسجيل محليًا.
 */
import { logger } from '@/lib/logger';

type ErrorReporter = {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, context?: Record<string, unknown>) => void;
};

let reporter: ErrorReporter | null = null;
let initialized = false;

export type InitErrorReportingOptions = {
  dsn?: string;
  /** Adapter injected by the native crash-reporting integration or tests. */
  custom?: ErrorReporter;
};

/**
 * Starts error reporting without creating a hard Metro dependency on an SDK that
 * is not installed. This deliberately does not pretend that a DSN alone activates Sentry.
 */
export function initErrorReporting(options: InitErrorReportingOptions = {}): void {
  if (initialized && !options.custom) return;
  initialized = true;

  if (options.custom) {
    reporter = options.custom;
    logger.info('error-reporting', 'Custom error reporter initialized');
    return;
  }

  reporter = null;
  if (options.dsn) {
    logger.warn(
      'error-reporting',
      'Crash-reporting DSN is configured but no native reporter adapter is installed; using local logging only',
    );
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('error-reporting', message, context);
  try {
    reporter?.captureException(error, context);
  } catch {
    /* Reporting must never crash the application. */
  }
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  logger.warn('error-reporting', message, context);
  try {
    reporter?.captureMessage(message, context);
  } catch {
    /* Reporting must never crash the application. */
  }
}
