/**
 * حالة تحميل صفحة موحّدة — هياكل ناعمة تطابق تصميم الواجهات
 * (الرئيسية، التصفح، البحث، التفاصيل، المتجر، الملف، الرسائل، المحادثة، المبيعات، الإعدادات).
 *
 * `delayed` (الافتراضي true): يبقى شفافاً أول 200ms عبر .loading-delayed
 * لمنع الوميض عند التنقّل السريع (يعمل داخل Server Components).
 */
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { LOADING_COPY } from '@/lib/loadingCopy';

export type PageLoadingVariant =
  | 'home'
  | 'browse'
  | 'search'
  | 'detail'
  | 'store'
  | 'profile'
  | 'messages'
  | 'chat'
  | 'sales'
  | 'settings'
  | 'cards'
  | 'list'
  | 'table'
  | 'minimal'
  | 'bar';

interface PageLoadingStateProps {
  title?: string;
  description?: string;
  variant?: PageLoadingVariant;
  /** إخفاء أول 200ms لمنع الوميض (افتراضي true). */
  delayed?: boolean;
  className?: string;
}

function CardTile() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none rounded-t-2xl" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function SearchPill() {
  return <Skeleton className="h-12 w-full rounded-full" />;
}

function ChipRow({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('h-9 rounded-full', i === 0 ? 'w-16' : 'w-20')} />
      ))}
    </div>
  );
}

export function PageLoadingState({
  title = LOADING_COPY.page,
  description = 'نجهّز المحتوى لك…',
  variant = 'cards',
  delayed = true,
  className,
}: PageLoadingStateProps) {
  return (
    <div
      className={cn('w-full bg-background', delayed && 'loading-delayed', className)}
      role="status"
      aria-busy="true"
      aria-label={title}
    >
      {/* شريط تقدّم علوي موحّد */}
      <div className="fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-primary/15" aria-hidden="true">
        <div className="nav-progress-bar h-full w-full bg-primary" />
      </div>

      <span className="sr-only">
        {title}
        {description ? ` — ${description}` : ''}
      </span>

      {/* ——— الرئيسية ——— */}
      {variant === 'home' && (
        <div className="mx-auto max-w-7xl space-y-5 px-4 py-4">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-14 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CardTile />
            <CardTile />
          </div>
        </div>
      )}

      {/* ——— تصفح إعلانات/منتجات ——— */}
      {(variant === 'browse' || variant === 'cards') && (
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
          <div className="space-y-1 text-end">
            <Skeleton className="ms-auto h-7 w-28" />
            <Skeleton className="ms-auto h-4 w-48" />
          </div>
          <SearchPill />
          <ChipRow count={5} />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Skeleton className="h-9 w-14 rounded-full" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardTile key={i} />
            ))}
          </div>
        </div>
      )}

      {/* ——— نتائج البحث ——— */}
      {variant === 'search' && (
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
          <SearchPill />
          <div className="flex gap-4 border-b border-border pb-0">
            {['الكل', 'المنتجات', 'المحلات', 'الإعلانات', 'الخدمات'].map((_, i) => (
              <Skeleton key={i} className={cn('h-9 w-16 rounded-none', i === 0 && 'border-b-2 border-primary')} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Skeleton className="h-9 w-14 rounded-full" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardTile key={i} />
            ))}
          </div>
        </div>
      )}

      {/* ——— تفاصيل إعلان ——— */}
      {variant === 'detail' && (
        <div className="mx-auto max-w-3xl space-y-4 px-0 pb-8 sm:px-4 sm:py-5">
          <Skeleton className="aspect-[4/3] w-full rounded-none sm:rounded-2xl" />
          <div className="space-y-3 px-4">
            <div className="flex justify-center gap-1.5">
              <Skeleton className="h-1.5 w-6 rounded-full" />
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
            </div>
            <Skeleton className="h-6 w-3/4 ms-auto" />
            <Skeleton className="h-5 w-1/3 ms-auto" />
            <div className="flex flex-wrap justify-end gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
            <div className="space-y-2 pt-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      )}

      {/* ——— صفحة المتجر ——— */}
      {variant === 'store' && (
        <div className="mx-auto max-w-3xl space-y-0 pb-8">
          <Skeleton className="h-36 w-full rounded-none" />
          <div className="-mt-10 flex flex-col items-center gap-2 px-4">
            <Skeleton className="h-20 w-20 rounded-full border-4 border-white" />
            <Skeleton className="h-5 w-36" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="mt-4 space-y-3 px-4">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-11 w-full rounded-2xl" />
            <div className="flex justify-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-14 rounded-full" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <CardTile />
              <CardTile />
            </div>
          </div>
        </div>
      )}

      {/* ——— الملف الشخصي ——— */}
      {variant === 'profile' && (
        <div className="mx-auto max-w-3xl space-y-0 pb-8">
          <Skeleton className="h-28 w-full rounded-none" />
          <div className="-mt-10 flex flex-col items-center gap-2 px-4">
            <Skeleton className="h-20 w-20 rounded-full border-4 border-white" />
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="mt-4 space-y-3 px-4">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-11 w-full rounded-2xl" />
            <div className="flex justify-center gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="space-y-3 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                  <Skeleton className="h-16 w-16 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ——— قائمة المحادثات ——— */}
      {variant === 'messages' && (
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
          <Skeleton className="ms-auto h-7 w-24" />
          <SearchPill />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-14 rounded-full" />
            <Skeleton className="h-9 w-16 rounded-full" />
            <Skeleton className="h-9 w-14 rounded-full bg-primary/30" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ——— المحادثة ——— */}
      {variant === 'chat' && (
        <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <Skeleton className="h-10 w-2/5 self-start rounded-2xl rounded-ss-sm" />
            <Skeleton className="h-10 w-1/2 self-end rounded-2xl rounded-se-sm" />
            <Skeleton className="h-10 w-1/3 self-start rounded-2xl rounded-ss-sm" />
            <Skeleton className="h-16 w-3/5 self-end rounded-2xl rounded-se-sm" />
            <Skeleton className="h-10 w-2/5 self-start rounded-2xl rounded-ss-sm" />
            <Skeleton className="h-10 w-1/2 self-end rounded-2xl rounded-se-sm" />
            <Skeleton className="h-14 w-3/5 self-start rounded-2xl rounded-ss-sm" />
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-11 flex-1 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      )}

      {/* ——— سجل المبيعات ——— */}
      {variant === 'sales' && (
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
          <div className="space-y-1 text-end">
            <Skeleton className="ms-auto h-7 w-32" />
            <Skeleton className="ms-auto h-4 w-48" />
          </div>
          <div className="flex gap-3 overflow-x-auto border-b border-border pb-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-16 shrink-0 rounded-none" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-2xl" />
          <SearchPill />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4 ms-auto" />
                  <Skeleton className="h-3 w-1/2 ms-auto" />
                  <Skeleton className="h-3 w-2/5 ms-auto" />
                </div>
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ——— الإعدادات ——— */}
      {variant === 'settings' && (
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
          <Skeleton className="ms-auto h-7 w-32" />
          <div className="flex gap-4 border-b border-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-none" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-2xl" />
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20 ms-auto" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ——— قائمة بسيطة ——— */}
      {variant === 'list' && (
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col justify-center gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ——— جدول ——— */}
      {variant === 'table' && (
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Skeleton className="h-11 w-full rounded-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t border-border p-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ms-auto h-4 w-1/6" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ——— minimal / bar ——— */}
      {(variant === 'minimal' || variant === 'bar') && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      )}
    </div>
  );
}
