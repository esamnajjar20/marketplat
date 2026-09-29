/**
 * ApiError — unified error display for API call failures.
 *
 *   401 → Unauthorized
 *   403 → Forbidden
 *   404 → not-found
 *   500+ → server error
 *
 * Phase 3: visual alignment with EmptyState (icon well + hierarchy).
 */
'use client';

import { SearchX, AlertTriangle } from 'lucide-react';
import { Unauthorized } from './Unauthorized';
import { Forbidden } from './Forbidden';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import type { ParsedError } from '@/lib/errorParser';

interface ApiErrorProps {
  error: ParsedError | Error | unknown;
  onRetry?: () => void;
  variant?: 'page' | 'inline';
}

function getStatusCode(error: unknown): number {
  if (error && typeof error === 'object') {
    if ('statusCode' in error) return (error as { statusCode: number }).statusCode;
    if ('status' in error) return (error as { status: number }).status;
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
  const message = getMessage(error);

  if (statusCode === 401) return <Unauthorized />;
  if (statusCode === 403) return <Forbidden />;

  const is404 = statusCode === 404;
  const title = is404
    ? 'غير موجود'
    : statusCode >= 500
      ? 'خطأ في الخادم'
      : 'حدث خطأ ما';

  const description =
    statusCode >= 500
      ? `${message} تم إبلاغ فريقنا — حاول مرة أخرى بعد قليل.`
      : message;

  const content = (
    <EmptyState
      tone={is404 ? 'muted' : 'warning'}
      compact={variant === 'inline'}
      icon={
        is404 ? (
          <SearchX aria-hidden />
        ) : (
          <AlertTriangle aria-hidden />
        )
      }
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button onClick={onRetry} variant="outline" size="sm" className="rounded-xl">
            إعادة المحاولة
          </Button>
        ) : undefined
      }
    />
  );

  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface-1/50 py-6">
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 sm:min-h-[60vh]">
      {content}
    </div>
  );
}
