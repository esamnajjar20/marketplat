/**
 * حالة تحميل صفحة/قسم — شريط تقدّم + هيكل مفهوم + رسالة.
 *
 * `delayed` (الافتراضي true): يبقى شفافاً أول 200ms عبر CSS فقط (.loading-delayed)،
 * فلا يومض عند التنقّل السريع، ويعمل داخل Server Components مثل loading.tsx.
 * المساحة محجوزة طوال الوقت فلا قفزة في التخطيط.
 */
import { LoadingState } from '@/components/shared/feedback/LoadingState';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { LOADING_COPY } from '@/lib/loadingCopy';

interface PageLoadingStateProps {
  title?: string;
  description?: string;
  variant?: 'bar' | 'cards' | 'list' | 'detail' | 'table' | 'minimal';
  /** إخفاء أول 200ms لمنع الوميض (افتراضي true). */
  delayed?: boolean;
  className?: string;
}

export function PageLoadingState({
  title = LOADING_COPY.default,
  description = 'نجهّز المحتوى لك…',
  variant = 'cards',
  delayed = true,
  className,
}: PageLoadingStateProps) {
  return (
    <div
      className={cn('w-full', delayed && 'loading-delayed', className)}
      role="status"
      aria-busy="true"
      aria-label={title}
    >
      <div className="fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-primary/10" aria-hidden="true">
        <div className="nav-progress-bar h-full w-full" />
      </div>

      {(variant === 'minimal' || variant === 'bar') && (
        <LoadingState
          announce={false}
          variant="page"
          size="xl"
          label={title}
          description={description}
          className="min-h-[40vh] px-4"
        />
      )}

      {variant === 'cards' && (
        <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
          <LoadingState announce={false} variant="inline" size="md" label={title} description={description} />
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
          <LoadingState announce={false} variant="inline" size="md" label={title} description={description} />
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

      {variant === 'table' && (
        <div className="container mx-auto max-w-5xl space-y-4 px-4 py-8">
          <LoadingState announce={false} variant="inline" size="md" label={title} description={description} />
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <Skeleton className="h-11 w-full rounded-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t border-border/60 p-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ms-auto h-4 w-1/6" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
