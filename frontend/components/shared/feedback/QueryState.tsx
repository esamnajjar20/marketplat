'use client';

/**
 * QueryState — غلاف موحّد لحالات الاستعلام (تحميل / خطأ / فارغ / محتوى).
 *
 * الاستخدام:
 *   <QueryState isLoading={isLoading} isError={isError} onRetry={refetch} isEmpty={!items.length}>
 *     {items.map(...)}
 *   </QueryState>
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
  /** هيكل تحميل مخصّص (skeleton) بدل spinner */
  loadingFallback?: ReactNode;
  /** إظهار شريط «جاري التحديث» فوق المحتوى أثناء refetch */
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
  emptyDescription = 'جرّب تغيير الفلاتر أو العودة لاحقاً.',
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
          <div className="flex min-h-[40vh] items-center justify-center">
            <LoadingSpinner label="جارٍ التحميل…" />
          </div>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title="حدث خطأ"
          description={errorMessage}
          action={
            onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
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
          icon={emptyIcon ?? <SearchX className="h-10 w-10" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <div className={cn('relative w-full', className)}>
      {showRefetchBar && isFetching && !isLoading && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/10"
          aria-hidden
        >
          <div className="nav-progress-bar h-full opacity-80" />
        </div>
      )}
      {children}
    </div>
  );
}
