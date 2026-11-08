'use client';

import { QueryRetryCard } from '@/components/shared/feedback/QueryRetryCard';

import { LIST_SERVICE_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { cn } from '@/lib/utils';
import { ListViewToggle } from '@/components/shared/list/ListViewToggle';
import { Button } from '@/components/shared/ui/Button';

import dynamic from 'next/dynamic';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ServiceListingCard } from './ServiceListingCard';
import { ROUTES } from '@/lib/constants';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons/ServiceListingCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { serviceListingsApi } from '@/api/service-listings.api';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';
import type { ServiceListingSortField } from '@/types/service.types';
import { useNetworkPolicy } from '@/hooks/useNetworkPolicy';
import { getStablePageSize } from '@/lib/networkPolicy';
import { queryKeys } from '@/lib/queryKeys';
import type { BrowsePage } from '@/types/browse.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import { CACHE_TTL } from '@/lib/constants';
import { canonicalBrowseSearchParams, getBrowseNumber, getBrowseParam, parseBrowseSearchParams, serializeBrowseSearchParams, SSR_BROWSE_PAGE_SIZE, type BrowseSearchParams } from '@/lib/browseSearchParams';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

const SaveSearchButton = dynamic(
  () => import('@/components/ads/SaveSearchButton').then((module) => module.SaveSearchButton),
  { ssr: false, loading: () => null },
);

interface ServiceListingsGridProps {
  initialPage?: BrowsePage<ServiceListingWithProvider> | null;
  initialPageUpdatedAt?: number;
  searchParams?: BrowseSearchParams;
}

export function ServiceListingsGrid({ initialPage, initialPageUpdatedAt, searchParams: initialSearchParams = {} }: ServiceListingsGridProps = {}) {
  const isOnline = useOnlineStatus();
  const liveSearchParams = useSearchParams();
  const liveQueryString = liveSearchParams.toString();
  const searchParams = useMemo(() => parseBrowseSearchParams(liveQueryString), [liveQueryString]);
  const seedMatchesUrl = canonicalBrowseSearchParams(initialSearchParams) === canonicalBrowseSearchParams(new URLSearchParams(liveQueryString));
  const seededInitialPage = seedMatchesUrl ? initialPage : undefined;
  const search = getBrowseParam(searchParams, 'search');
  const categoryId = getBrowseParam(searchParams, 'categoryId');
  const serviceTypeId = getBrowseParam(searchParams, 'serviceTypeId');
  const providerId = getBrowseParam(searchParams, 'providerId');
  const city = getBrowseParam(searchParams, 'city');
  const serviceLocation = (getBrowseParam(searchParams, 'serviceLocation') as 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | undefined) ?? undefined;
  const minPrice = getBrowseNumber(searchParams, 'minPrice');
  const maxPrice = getBrowseNumber(searchParams, 'maxPrice');
  const sortBy = (getBrowseParam(searchParams, 'sortBy') as ServiceListingSortField) ?? 'createdAt';
  const sortOrder = (getBrowseParam(searchParams, 'sortOrder') as 'asc' | 'desc') ?? 'desc';
  const view = getBrowseParam(searchParams, 'view') === 'list' ? 'list' : 'grid';

  const networkPolicy = useNetworkPolicy();
  const pageSize = initialPage ? SSR_BROWSE_PAGE_SIZE : getStablePageSize(12, networkPolicy);

  const query = useInfiniteQuery({
    queryKey: queryKeys.serviceListings.infinite({ search, serviceTypeId, categoryId, providerId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder, pageSize }),
    initialPageParam: 1,
    initialData: seededInitialPage ? { pages: [seededInitialPage], pageParams: [1] } : undefined,
    initialDataUpdatedAt: seededInitialPage ? initialPageUpdatedAt : undefined,
    staleTime: CACHE_TTL.adsList,
    queryFn: ({ pageParam, signal }) => serviceListingsApi.getAll({
      search, serviceTypeId, categoryId, providerId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder,
      page: pageParam,
      limit: pageSize,
    }, { signal }).then((r) => r.data.data),
    getNextPageParam: (lastPage) => lastPage?.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
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
        loading={isLoading}
        description="لا تتوفر بيانات الخدمات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
        fallback={
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className={cn(view === 'list' ? 'grid grid-cols-1 gap-3 sm:gap-4' : LIST_SERVICE_GRID_CLASS)}>
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
      <QueryRetryCard
        tone="error"
        title="حدث خطأ أثناء تحميل الخدمات"
        onRetry={() => void refetch()}
      />
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
        <p className="text-[13px] font-extrabold text-foreground">
          {total > 0 ? `${total} خدمة` : 'لا توجد نتائج'}
          {search && <> بحثاً عن «<span className="font-medium">{search}</span>»</>}
        </p>
        <div className="flex items-center gap-2"><SaveSearchButton type="services" queryParamKey="search" /><ListViewToggle value={view} searchParamsString={serializeBrowseSearchParams(searchParams)} /></div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد خدمات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد خدمات مطابقة لهذه الفلاتر'}
          action={
            (search || serviceTypeId || categoryId || city || serviceLocation || minPrice !== undefined || maxPrice !== undefined || getBrowseParam(searchParams, 'attributeFilters')) ? (
              <Button variant="outline" size="sm" asChild>
                <IntentPrefetchLink href={ROUTES.services} prefetch={false}>مسح الفلاتر وتجربة الكل</IntentPrefetchLink>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(
          view === 'list'
            ? 'grid grid-cols-1 gap-3 sm:gap-4'
            : LIST_SERVICE_GRID_CLASS,
        )}>
          {items.map((listing) => (
            <ServiceListingCard
              key={listing.id}
              listing={listing}
              density={view === 'list' ? 'compact' : 'default'}
              layout={view === "list" ? "list" : "grid"}
              designLayout
              context="catalog"
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <InfiniteScrollTrigger hasNextPage={Boolean(hasNextPage)} isFetchingNextPage={isFetchingNextPage} isError={isFetchNextPageError} onLoadMore={loadMore} />
      )}
    </div>
      </>
  );
}
