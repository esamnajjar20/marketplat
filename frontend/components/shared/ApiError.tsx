/**
 * ApiError — unified error display for API call failures.
 *
 * Dispatches to the correct specialised component based on statusCode:
 *   401 → Unauthorized
 *   403 → Forbidden
 *   404 → inline not-found message
 *   500+ → generic server error
 *
 * Usage:
 *   const { error } = useAd(id);
 *   if (error) return <ApiError error={error} />;
 */
'use client';

import { Unauthorized } from './Unauthorized';
import { Forbidden }    from './Forbidden';
import { Button }       from '@/components/shared/ui/Button';
import type { ParsedError } from '@/lib/errorParser';

interface ApiErrorProps {
  /** A ParsedError from errorParser, or any Error-like object. */
  error: ParsedError | Error | unknown;
  /** Called when the user clicks "Try again". If omitted, button is hidden. */
  onRetry?: () => void;
  /** Override the default full-page layout with a compact inline card. */
  variant?: 'page' | 'inline';
}

function getStatusCode(error: unknown): number {
  if (error && typeof error === 'object') {
    if ('statusCode' in error) return (error as { statusCode: number }).statusCode;
    if ('status'     in error) return (error as { status: number }).status;
  }
  return 500;
}

function getMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'حدث خطأ غير متوقع.';
}

export function ApiError({ error, onRetry, variant = 'page' }: ApiErrorProps) {
  const statusCode = getStatusCode(error);
  const message    = getMessage(error);

  // Delegate to specialised components for auth errors
  if (statusCode === 401) return <Unauthorized />;
  if (statusCode === 403) return <Forbidden />;

  const isInline = variant === 'inline';

  const content = (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="text-5xl">
        {statusCode === 404 ? '🔍' : statusCode >= 500 ? '🔥' : '⚠️'}
      </span>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {statusCode === 404
            ? 'غير موجود'
            : statusCode >= 500
              ? 'خطأ في الخادم'
              : 'حدث خطأ ما'}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
        {statusCode >= 500 && (
          <p className="text-xs text-muted-foreground">
            تم إبلاغ فريقنا بالمشكلة. يرجى المحاولة مرة أخرى بعد قليل.
          </p>
        )}
      </div>

      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          إعادة المحاولة
        </Button>
      )}
    </div>
  );

  if (isInline) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-12">
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      {content}
    </div>
  );
}
