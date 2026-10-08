/**
 * Unified API error presentation.
 *
 * The component intentionally consumes the parsed error contract instead of
 * inspecting backend English messages. This keeps HTTP/code policy in one
 * place and makes all pages render network, conflict, rate-limit and server
 * failures consistently.
 */
'use client';

import { AlertTriangle, CloudOff, SearchX, ShieldAlert, WifiOff } from 'lucide-react';
import { Unauthorized } from './Unauthorized';
import { Forbidden } from './Forbidden';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import type { ParsedError } from '@/lib/errorParser';
import { classifyError } from '@/lib/errorPolicy';

interface ApiErrorProps {
  error: ParsedError | Error | unknown;
  onRetry?: () => void;
  variant?: 'page' | 'inline';
}

function getStatusCode(error: unknown): number {
  if (error && typeof error === 'object') {
    if ('statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') {
      return (error as { statusCode: number }).statusCode;
    }
    if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }
  }
  return 500;
}

function getCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function getMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'حدث خطأ غير متوقع.';
}

export function ApiError({ error, onRetry, variant = 'page' }: ApiErrorProps) {
  const statusCode = getStatusCode(error);
  const code = getCode(error);
  const message = getMessage(error);

  const kind = classifyError({ statusCode, code, message });
  if (kind === 'unauthorized') return <Unauthorized />;
  if (kind === 'forbidden') return <Forbidden />;

  const isNetwork = kind === 'network';
  const is404 = kind === 'not-found';
  const isConflict = kind === 'conflict';
  const isRateLimited = kind === 'rate-limit';
  const isUnavailable = kind === 'service-unavailable';
  const isServer = kind === 'server';

  const title = isNetwork
    ? 'تعذّر الاتصال'
    : is404
      ? 'غير موجود'
      : isConflict
        ? 'تعارض في البيانات'
        : isRateLimited
          ? 'طلبات كثيرة جداً'
          : isUnavailable
            ? 'الخدمة غير متاحة مؤقتاً'
            : isServer
              ? 'خطأ في الخادم'
              : statusCode >= 400
                ? 'تعذّر تنفيذ الطلب'
                : 'حدث خطأ ما';

  const description = isNetwork
    ? 'تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.'
    : isRateLimited
      ? message
      : isUnavailable
        ? 'الخدمة غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.'
        : isServer
          ? `${message} تم إبلاغ فريقنا.`
          : message;

  const icon = isNetwork
    ? <WifiOff aria-hidden />
    : is404
      ? <SearchX aria-hidden />
      : isUnavailable
        ? <CloudOff aria-hidden />
        : isConflict
          ? <ShieldAlert aria-hidden />
          : <AlertTriangle aria-hidden />;

  const content = (
    <EmptyState
      tone={is404 ? 'muted' : 'warning'}
      compact={variant === 'inline'}
      icon={icon}
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
