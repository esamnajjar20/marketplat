'use client';

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
  const page = Number(sp.get('page') ?? 1);

  const { data, isLoading, isError, refetch } = useProducts({ storeId, page, limit: 12 });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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
          <ProductCard key={product.id} product={product} storeId={storeId} />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.storeDetail(storeId)}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}
    </div>
  );
}
