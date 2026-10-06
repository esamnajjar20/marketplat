'use client';

import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { PullToRefresh } from '@/components/shared/ui/PullToRefresh';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { productsApi } from '@/api/products.api';
import { cn } from '@/lib/utils';
import { ListViewToggle } from '@/components/shared/list/ListViewToggle';
import { Button } from '@/components/shared/ui/Button';
import { LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';
import { BrowseCityHint } from '@/components/shared/BrowseCityHint';
import { useNetworkPolicy } from '@/hooks/useNetworkPolicy';
import { getAdaptivePageSize } from '@/lib/networkPolicy';
import type { ProductSortField } from '@/types/product.types';

/**
 * GET /products directory grid — mirrors StoresGrid's layout/behavior
 * exactly (same URL param reading, same loading/error/empty states,
 * same Pagination usage). useProducts() with no storeId returns
 * ProductWithStore rows across every store (see products.api.ts's
 * getAll — same unwrapPaginated shape StoresGrid already consumes via
 * useStores), so no new API or hook was needed for this page.
 *
 * Each card shows its parent store's name/logo above the product
 * (see the store-attribution row below) so a product never reads as
 * ownerless in this cross-store view — StoreProducts.tsx doesn't need
 * this same treatment since it's already scoped to one store's page.
 */
export function ProductsGrid() {
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  // clamp URL page param to positive integer.
  const city = sp.get('city') ?? undefined;
  const sortBy = (sp.get('sortBy') as ProductSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';
  // PROMO-1 (): reads the same ?hasPromotion=true query param
  // PromotedProductsSection's "عرض الكل" CTA links to — no filter
  // toggle UI here yet (that's the fuller scope), just making
  // the URL param this page already receives actually take effect.
  const hasPromotion = sp.get('hasPromotion') === 'true' ? true : undefined;
  const view = sp.get('view') === 'list' ? 'list' : 'grid';

  const networkPolicy = useNetworkPolicy();
  const pageSize = getAdaptivePageSize(12, networkPolicy);

  const query = useInfiniteQuery({
    queryKey: ['products', 'infinite', { search, city, sortBy, sortOrder, hasPromotion, pageSize }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => productsApi.getAll({
      search, city, sortBy, sortOrder, hasPromotion, page: pageParam, limit: pageSize,
    }).then((r) => r.data.data),
    getNextPageParam: (lastPage) => lastPage?.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const items = data?.pages.flatMap((pageData) => pageData?.items ?? []) ?? [];
  const firstMeta = data?.pages[0]?.meta;
  const total = firstMeta?.total ?? items.length;
  const loadMore = () => { void fetchNextPage(); };


  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className={cn(LIST_CARD_GRID_CLASS)}>
          {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المنتجات</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => refetch()}>
      <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} isPlaceholderData={false} />
      <div className="space-y-4">
      {/* Toolbar — same "count on the left, save-search on the right"
          pattern as ads/SearchResults.tsx. queryParamKey="search"
          because this page's free-text param is `search`, not `q` (see
          SaveSearchButton's own doc comment for why that differs by
          page). */}
      <div className="space-y-1.5">
      <BrowseCityHint />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} منتج` : 'لا توجد نتائج'}
          {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
        </p>
        <div className="flex items-center gap-2"><SaveSearchButton type="products" queryParamKey="search" /><ListViewToggle /></div>
      </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد منتجات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد منتجات مطابقة لهذه الفلاتر'}
        />
      ) : (
        // DESKTOP-AUDIT-06: the app never used the 2xl breakpoint
        // anywhere — the container's own 1400px cap kept things from
        // looking broken on very wide screens, but capped at
        // lg:grid-cols-4 that just meant wider empty gutters past
        // ~1600px instead of an extra column of actual content. Same
        // change applied to ServiceListingsGrid/search+ads
        // SearchResults/StoresGrid.
        <div className={cn(view === 'list' ? 'grid grid-cols-1 gap-3' : LIST_CARD_GRID_CLASS, 'stagger-fade-in')}>
          {items.map((product) => (
            <div key={product.id} className="space-y-1.5">
              <ProductCard product={product} storeId={product.store.id} context="catalog" density={view === 'list' ? 'compact' : 'default'} layout={view} />
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <InfiniteScrollTrigger
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={loadMore}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
