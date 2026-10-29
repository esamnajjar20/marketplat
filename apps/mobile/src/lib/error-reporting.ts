/**
 * طبقة إبلاغ أخطاء — جاهزة لـ Sentry.
 *
 * التفعيل:
 *   npx expo install @sentry/react-native
 *   ثم في _layout: initErrorReporting({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN })
 */
import { logger } from '@/lib/logger';

type ErrorReporter = {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, context?: Record<string, unknown>) => void;
};

let reporter: ErrorReporter | null = null;

export type InitErrorReportingOptions = {
  dsn?: string;
  /** حقن مخصّص (اختبارات) */
  custom?: ErrorReporter;
};

/**
 * يحاول تحميل Sentry إن وُجدت الحزمة وdsn، وإلا يبقى التسجيل المحلي فقط.
 */
export function initErrorReporting(options: InitErrorReportingOptions = {}): void {
  if (options.custom) {
    reporter = options.custom;
    return;
  }
  if (!options.dsn) {
    reporter = null;
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as {
      init: (o: { dsn: string; tracesSampleRate?: number }) => void;
      captureException: (e: unknown) => void;
      captureMessage: (m: string) => void;
      setContext: (name: string, ctx: Record<string, unknown>) => void;
    };
    Sentry.init({ dsn: options.dsn, tracesSampleRate: 0.15 });
    reporter = {
      captureException: (error, context) => {
        if (context) Sentry.setContext('extra', context);
        Sentry.captureException(error);
      },
      captureMessage: (message, context) => {
        if (context) Sentry.setContext('extra', context);
        Sentry.captureMessage(message);
      },
    };
    logger.info('error-reporting', 'Sentry initialized');
  } catch {
    logger.warn('error-reporting', 'Sentry package not installed; local logging only');
    reporter = null;
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('error-reporting', message, context);
  try {
    reporter?.captureException(error, context);
  } catch {
    /* ignore */
  }
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  logger.warn('error-reporting', message, context);
  try {
    reporter?.captureMessage(message, context);
  } catch {
    /* ignore */
  }
}
