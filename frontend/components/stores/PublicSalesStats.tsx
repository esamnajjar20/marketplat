'use client';

import { useQuery } from '@tanstack/react-query';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { BadgeCheck, BarChart3, Star } from 'lucide-react';
import type { PublicStoreSalesStats } from '@/types/public-store-stats.types';
import { queryKeys } from '@/lib/queryKeys';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { formatShortDate, formatNumber } from '@/lib/formatters';
import { sameOriginApi } from '@/lib/sameOriginApi';

type Stats = PublicStoreSalesStats;

export function PublicSalesStats({ slug }: { slug: string }) {
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: queryKeys.publicStoreSalesStats(slug),
    queryFn: async ({ signal }) => {
      const payload = await sameOriginApi<Stats>(`/public/stores/${encodeURIComponent(slug)}/stats`, {
        signal,
        cache: 'no-store',
      });
      if (!payload.data) throw new Error(payload.message || 'Store statistics response is empty');
      return payload.data;
    },
    staleTime: 20_000,
  });

  // A failed background refetch must not hide a valid persisted snapshot.
  // Only show the blocking error when there is no usable data at all.
  if (isLoading && !data) {
    return <LoadingGate loading={isLoading} label="جارٍ تحميل إحصائيات المتجر" fallback={<Skeleton className="h-64 rounded-2xl" />}>
      {null}
    </LoadingGate>;
  }
  if (!data) {
    return <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">تعذر تحميل إحصائيات المتجر.</div>;
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5" dir="rtl">
      {isError && (
        <p role="status" className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          تعذر تحديث الإحصائيات؛ نعرض آخر نسخة محفوظة.
        </p>
      )}
      {isFetching && !isError && (
        <p role="status" className="text-xs text-muted-foreground">جارٍ تحديث الإحصائيات…</p>
      )}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><BarChart3 /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{data.storeName}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {data.verifiedSeller ? <span className="inline-flex items-center gap-1 text-primary"><BadgeCheck className="h-4 w-4" />بائع موثّق</span> : null}
              <span className="inline-flex items-center gap-1"><Star className="h-4 w-4" /> {data.averageRating.toFixed(1)} ({data.reviewCount} تقييم)</span>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">إجمالي المبيعات</p><p className="mt-1 text-xl font-bold">{formatNumber(data.totalSales)}</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">التقييم</p><p className="mt-1 text-xl font-bold">{data.averageRating.toFixed(1)} ★</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">آخر مبيعة</p><p className="mt-1 text-sm font-semibold">{data.lastSaleAt ? formatShortDate(data.lastSaleAt) : 'لا توجد'}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <IntentPrefetchLink href={`/stores/${data.storeId}`} className="rounded-lg border px-4 py-2 text-sm" prefetch={false}>عرض المتجر</IntentPrefetchLink>

        </div>
      </div>
    </section>
  );
}
