'use client';

import { cn } from '@/lib/utils';
import { ListViewToggle } from '@/components/shared/list/ListViewToggle';
import { Button } from '@/components/shared/ui/Button';
import { LIST_STORE_GRID_CLASS } from '@/components/shared/list/ListPageShell';

import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { StoreCard } from './StoreCard';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { storesApi } from '@/api/stores.api';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';
import type { StoreSortField } from '@/types/store.types';
import { useNetworkPolicy } from '@/hooks/useNetworkPolicy';
import { getAdaptivePageSize } from '@/lib/networkPolicy';

/** GET /stores directory grid. Mirrors ServiceListingsGrid's layout/behaviour. */
export function StoresGrid() {
  const sp = useSearchParams();
  const isOnline = useOnlineStatus();

  const search = sp.get('search') ?? undefined;
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const city = sp.get('city') ?? undefined;
  const sortBy = (sp.get('sortBy') as StoreSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';
  const view = sp.get('view') === 'list' ? 'list' : 'grid';

  const networkPolicy = useNetworkPolicy();
  const pageSize = getAdaptivePageSize(12, networkPolicy);

  const query = useInfiniteQuery({
    queryKey: ['stores', 'infinite', { search, city, sortBy, sortOrder, pageSize }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => storesApi.getAll({ search, city, sortBy, sortOrder, page: pageParam, limit: pageSize }).then((r) => r.data.data),
    getNextPageParam: (lastPage) => lastPage?.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;


  const items = data?.pages.flatMap((pageData) => pageData?.items ?? []) ?? [];
  const firstMeta = data?.pages[0]?.meta;
  const total = firstMeta?.total ?? items.length;
  const loadMore = () => { void fetchNextPage(); };

  // FIX UX-04: same fix as SearchResults/ServiceListingsGrid — a
  // centered spinner replaced the whole directory on every filter
  // change instead of a skeleton shaped like the actual cards.

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        {/* DESKTOP-AUDIT-05: capped at md:grid-cols-2 with no lg/xl/2xl
            step at all, unlike ProductsGrid/ServiceListingsGrid/
            SearchResults sharing this exact same content column width
            (see the lg:grid-cols-4 sidebar+content split in
            stores/page.tsx) — store cards are horizontal list-style
            (flex row, min-w-0 flex-1 text) so they reflow safely into
            more columns, they just never had the breakpoints to do so. */}
        <div className={cn(LIST_STORE_GRID_CLASS)}>
          {Array.from({ length: 6 }).map((_, i) => <StoreCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (isError) {
    // STORES-GRID-OFFLINE-01: useStores already caches the unfiltered
    // first page for offline replay. A failure with NO cache while
    // offline is not "an error" in the user's mind — it's "I'm not
    // connected". Same distinction SearchResults.tsx already draws.
    if (!isOnline) {
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-destructive">تحتاج اتصالاً بالإنترنت لعرض المتاجر</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            لا توجد نسخة محفوظة على الجهاز بعد. افتح التطبيق مرة واحدة
            وأنت متصل ليصبح متاحاً لاحقاً بدون اتصال.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المتاجر</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* SLOW-NET phase4 */}
      <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} isPlaceholderData={false} />
      <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} متجر` : 'لا توجد نتائج'}
        {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
      </p>
      <ListViewToggle />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد متاجر"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد متاجر مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className={cn(view === 'list' ? 'grid grid-cols-1 gap-3' : LIST_STORE_GRID_CLASS, 'stagger-fade-in')}>
          {items.map((store) => (
            <StoreCard key={store.id} store={store} density={view === 'list' ? 'compact' : 'default'} layout={view} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <InfiniteScrollTrigger hasNextPage={Boolean(hasNextPage)} isFetchingNextPage={isFetchingNextPage} onLoadMore={loadMore} />
      )}
    </div>
      </>
  );
}
