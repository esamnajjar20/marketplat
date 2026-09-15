/**
 * حالة تحميل صفحة/قسم — شريط تقدّم + هيكل مفهوم + رسالة.
 */
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';

interface PageLoadingStateProps {
  title?: string;
  description?: string;
  variant?: 'bar' | 'cards' | 'list' | 'detail' | 'minimal';
  className?: string;
}

export function PageLoadingState({
  title = 'جارٍ التحميل',
  description = 'نجهّز المحتوى لك…',
  variant = 'cards',
  className,
}: PageLoadingStateProps) {
  return (
    <div className={cn('w-full', className)} role="status" aria-busy="true" aria-label={title}>
      <div className="fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-primary/10">
        <div className="nav-progress-bar h-full w-full" />
      </div>

      {(variant === 'minimal' || variant === 'bar') && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
          <LoadingSpinner size="lg" hideLabel />
          <div className="space-y-1 text-center">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      )}

      {variant === 'cards' && (
        <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" hideLabel />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card"
              >
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'list' && (
        <div className="container mx-auto max-w-2xl space-y-4 px-4 py-8">
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" hideLabel />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-2xl border border-border/60 bg-card p-3">
                <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'detail' && (
        <div className="container mx-auto max-w-3xl space-y-5 px-4 py-8">
          <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 flex-1 rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
