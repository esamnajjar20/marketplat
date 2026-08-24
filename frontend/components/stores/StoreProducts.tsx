'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
import { track } from '@/lib/analytics';

interface Props {
  storeId: string;
}

/**
 * Unlike GET /service-providers/:id, the backend's GET /stores/:id
 * does NOT embed the product list — only `_count.products`. So this
 * fetches products client-side via GET /products?storeId=..., the
 * same public endpoint the /products browse page would use, scoped to
 * this one store.
 */
export function StoreProducts({ storeId }: Props) {
  const sp = useSearchParams();
  // FIX BUG-09: this used to read `page` from the same useSearchParams()
  // as StoreReviewsList, both feeding into a <Pagination> that also
  // shared the same baseUrl — paging one section silently reset/paged
  // the other, since both were just reading/writing the same bare
  // `page` param. Namespaced to `productsPage` so the two sections no
  // longer collide; see StoreReviewsList's matching `reviewsPage` fix.
  const page = Number(sp.get('productsPage') ?? 1);
  // FIX BUG-08: `product` was set by ProductCard's link
  // (/stores/:id?product=:productId) but nothing on this page ever
  // read it back — clicking a product card just reloaded the same
  // store page with an inert query param. Now used to scroll to and
  // briefly highlight the matching card once the grid has loaded, so
  // the link the card promises (drawing attention to that one product)
  // is actually kept.
  const highlightId = sp.get('product');
  const highlightRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useProducts({ storeId, page, limit: 12 });

  // FIX LINT-01: data?.items ?? [] created a brand-new array reference
  // on every render whenever data.items was absent (loading/error
  // states) — since `items` fed into the useEffect below, that made
  // the effect re-run on every render instead of only when the
  // product list actually changed. useMemo keeps the same reference
  // across renders as long as data.items itself hasn't changed.
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  // PR4A (recommendation view signals): the `?product=` deep link
  // (see FIX BUG-08 above) is this app's only "product detail" moment
  // — there is no dedicated /products/[id] route — so it doubles as
  // the PRODUCT_VIEW tracking point, same "one detail view per load"
  // signal AD_VIEW records on /ads/[id] (see AdDetailSection.tsx).
  // Deliberately keyed off the matched *product's* id/categoryId
  // (found in `items`, not just the raw highlightId param) so this
  // only fires once the highlighted product has actually loaded and
  // been confirmed to exist — a stale/invalid `?product=` id that
  // matches nothing in `items` records no event, same "not found ⇒ no
  // signal" posture ads/products use elsewhere in this module. Same
  // dependency-array dedup AD_VIEW relies on: this effect only re-runs
  // when the resolved id/categoryId pair actually changes, not on
  // every unrelated re-render (pagination on the reviews section,
  // favorites-toggle refetches, etc.).
  const highlightedProduct = useMemo(
    () => items.find((p) => p.id === highlightId) ?? null,
    [items, highlightId]
  );

  useEffect(() => {
    if (highlightedProduct) {
      track('PRODUCT_VIEW', {
        productId: highlightedProduct.id,
        categoryId: highlightedProduct.categoryId,
      });
    }
  }, [highlightedProduct?.id, highlightedProduct?.categoryId]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, items]);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المنتجات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-10 w-10" />}
        title="لا توجد منتجات"
        description="لم يضف هذا المتجر أي منتج بعد"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 stagger-fade-in">
        {items.map((product) => (
          <div
            key={product.id}
            ref={product.id === highlightId ? highlightRef : undefined}
            className={
              product.id === highlightId
                ? 'rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all'
                : undefined
            }
          >
            <ProductCard product={product} storeId={storeId} />
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.storeDetail(storeId)}
          searchParams={Object.fromEntries(
            Array.from(sp.entries()).filter(([k]) => k !== 'productsPage')
          )}
          pageParam="productsPage"
        />
      )}
    </div>
  );
}
