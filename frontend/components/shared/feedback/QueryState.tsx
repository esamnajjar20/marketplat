'use client';

/**
 * QueryState — غلاف موحّد: تحميل / خطأ / فارغ / محتوى.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, SearchX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { cn } from '@/lib/utils';

export interface QueryStateProps {
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  errorMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  showRefetchBar?: boolean;
  children: ReactNode;
  className?: string;
}

export function QueryState({
  isLoading,
  isFetching,
  isError,
  isEmpty,
  errorMessage = 'تعذّر تحميل البيانات. تحقق من الاتصال ثم أعد المحاولة.',
  emptyTitle = 'لا توجد نتائج',
  emptyDescription = 'جرّب تغيير الفلاتر أو كلمة البحث، أو عد لاحقًا.',
  emptyIcon,
  onRetry,
  loadingFallback,
  showRefetchBar = true,
  children,
  className,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        {loadingFallback ?? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
            <LoadingSpinner size="lg" hideLabel />
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          </div>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState
          icon={<AlertTriangle />}
          title="تعذّر التحميل"
          description={errorMessage}
          action={
            onRetry ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onRetry}
                className="min-h-10 gap-1.5 rounded-xl px-4"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                إعادة المحاولة
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState
          icon={emptyIcon ?? <SearchX />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <div className={cn('relative w-full', className)}>
      {showRefetchBar && isFetching && !isLoading ? (
        <div
          className="absolute inset-x-0 -top-1 z-10 flex justify-center"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/95 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            <LoadingSpinner size="sm" hideLabel className="!h-3.5 !w-3.5" />
            جارٍ التحديث…
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
