'use client';

import { LIST_SERVICE_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { cn } from '@/lib/utils';
import { ListViewToggle } from '@/components/shared/list/ListViewToggle';
import { Button } from '@/components/shared/ui/Button';

import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { ServiceListingCard } from './ServiceListingCard';
import { ROUTES } from '@/lib/constants';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { serviceListingsApi } from '@/api/service-listings.api';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';
import type { ServiceListingSortField } from '@/types/service.types';
import { useNetworkPolicy } from '@/hooks/useNetworkPolicy';
import { getAdaptivePageSize } from '@/lib/networkPolicy';
import { queryKeys } from '@/lib/queryKeys';

export function ServiceListingsGrid() {
  const isOnline = useOnlineStatus();
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const categoryId = sp.get('categoryId') ?? undefined;
  const serviceTypeId = sp.get('serviceTypeId') ?? undefined;
  const providerId = sp.get('providerId') ?? undefined;
  const city = sp.get('city') ?? undefined;
  const serviceLocation = (sp.get('serviceLocation') as 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | undefined) ?? undefined;
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const sortBy = (sp.get('sortBy') as ServiceListingSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';
  const view = sp.get('view') === 'list' ? 'list' : 'grid';

  const networkPolicy = useNetworkPolicy();
  const pageSize = getAdaptivePageSize(12, networkPolicy);

  const query = useInfiniteQuery({
    queryKey: queryKeys.serviceListings.infinite({ search, serviceTypeId, categoryId, providerId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder, pageSize }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => serviceListingsApi.getAll({
      search, serviceTypeId, categoryId, providerId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder,
      page: pageParam,
      limit: pageSize,
    }).then((r) => r.data.data),
    getNextPageParam: (lastPage) => lastPage?.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const items = data?.pages.flatMap((pageData) => pageData?.items ?? []) ?? [];
  const firstMeta = data?.pages[0]?.meta;
  const total = firstMeta?.total ?? items.length;
  const loadMore = () => { void fetchNextPage(); };


  // FIX UX-04: mirrors the same fix in SearchResults — a centered
  // spinner replaced the whole grid on every filter change instead of
  // a skeleton shaped like the actual cards.

  if (isLoading && !data) {
    return (
      <OfflineQueryFallback
        title="لا توجد نسخة محفوظة من الخدمات"
        description="لا تتوفر بيانات الخدمات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
        fallback={
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className={cn(LIST_SERVICE_GRID_CLASS)}>
          {Array.from({ length: 9 }).map((_, i) => <ServiceListingCardSkeleton key={i} />)}
        </div>
      </div>
        }
      />
    );
  }
  if (isError && !isOnline) {
    return (
      <OfflineQueryFallback
        fallback={null}
        title="لا توجد نسخة محفوظة من الخدمات"
        description="لا تتوفر بيانات الخدمات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
      />
    );
  }

  if (isError) {
    // UX-FIX P1-4: mirrors the same fix in SearchResults — a static red
    // line with no way to recover from a transient failure short of a
    // full reload.
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل الخدمات</p>
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
      {/* Toolbar — queryParamKey="search" for the same reason as
          ProductsGrid.tsx (see SaveSearchButton's own doc comment). */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} خدمة` : 'لا توجد نتائج'}
          {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
        </p>
        <div className="flex items-center gap-2"><SaveSearchButton type="services" queryParamKey="search" /><ListViewToggle /></div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد خدمات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد خدمات مطابقة لهذه الفلاتر'}
          action={
            (search || serviceTypeId || categoryId || city || serviceLocation || minPrice !== undefined || maxPrice !== undefined || sp.get('attributeFilters')) ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={ROUTES.services}>مسح الفلاتر وتجربة الكل</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(view === 'list' ? 'grid grid-cols-1 gap-3' : LIST_SERVICE_GRID_CLASS, 'stagger-fade-in')}>
          {items.map((listing) => (
            <ServiceListingCard key={listing.id} listing={listing} density={view === 'list' ? 'compact' : 'default'} layout={view} />
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
