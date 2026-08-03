'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';

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

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
