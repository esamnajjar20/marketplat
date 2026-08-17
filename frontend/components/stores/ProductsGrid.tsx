'use client';

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
 * GET /products public browse grid (Plan §10-11). Mirrors StoresGrid's
 * layout/behaviour exactly — same URL-param filters, same skeleton/
 * error/empty/pagination shape — so /products behaves consistently
 * with /stores rather than inventing a new convention.
 */
export function ProductsGrid() {
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  const page = Number(sp.get('page') ?? 1);
  const categoryId = sp.get('categoryId') ?? undefined;
  const sortBy = (sp.get('sortBy') as ProductSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const { data, isLoading, isError, refetch } = useProducts({
    search, page, categoryId, sortBy, sortOrder,
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
          {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
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
            <ProductCard key={product.id} product={product} storeId={product.storeId} />
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
