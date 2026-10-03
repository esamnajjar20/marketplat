'use client';

import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { PullToRefresh } from '@/components/shared/ui/PullToRefresh';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { BrowseCityHint } from '@/components/shared/BrowseCityHint';
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
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const city = sp.get('city') ?? undefined;
  const sortBy = (sp.get('sortBy') as ProductSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';
  // PROMO-1 (Phase 10): reads the same ?hasPromotion=true query param
  // PromotedProductsSection's "عرض الكل" CTA links to — no filter
  // toggle UI here yet (that's the fuller Phase 12 scope), just making
  // the URL param this page already receives actually take effect.
  const hasPromotion = sp.get('hasPromotion') === 'true' ? true : undefined;

  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useProducts({
    search, page, city, sortBy, sortOrder, hasPromotion, limit: 12,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());


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
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => refetch()}>
      <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} isPlaceholderData={isPlaceholderData} />
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
        <SaveSearchButton type="products" queryParamKey="search" />
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
        <div className={cn(LIST_CARD_GRID_CLASS, "stagger-fade-in")}>
          {items.map((product) => (
            <div key={product.id} className="space-y-1.5">
              <ProductCard product={product} storeId={product.store.id} context="catalog" />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.products}
          searchParams={searchParams}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
