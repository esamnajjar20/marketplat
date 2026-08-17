'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
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
  const page = Number(sp.get('page') ?? 1);
  const city = sp.get('city') ?? undefined;
  const sortBy = (sp.get('sortBy') as ProductSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const { data, isLoading, isError, refetch } = useProducts({
    search, page, city, sortBy, sortOrder, limit: 12,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} منتج` : 'لا توجد نتائج'}
        {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد منتجات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد منتجات مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((product) => (
            <div key={product.id} className="space-y-1.5">
              {/* Store attribution — the one thing StoreProducts.tsx
                  doesn't need (it's already inside one store's page)
                  but this cross-store view does, per the "make clear
                  a product belongs to a store" requirement. */}
              <Link
                href={ROUTES.storeDetail(product.store.id)}
                className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="truncate">{product.store.name}</span>
              </Link>
              <ProductCard product={product} storeId={product.store.id} />
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
  );
}
