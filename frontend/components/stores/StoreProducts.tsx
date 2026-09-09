'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ProductRecommendations } from '@/components/recommendations/ProductRecommendations';
import { DownloadStoreCatalogButton } from '@/components/stores/DownloadStoreCatalogButton';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { ProductSortField } from '@/types/product.types';

interface Props {
  storeId: string;
  /** اسم المتجر لعنوان ملف التحميل — اختياري */
  storeName?: string;
  offersOnly?: boolean;
}

const SORT_OPTIONS: { value: string; label: string; sortBy: ProductSortField; sortOrder: 'asc' | 'desc' }[] = [
  { value: 'newest', label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'price_asc', label: 'السعر: الأقل', sortBy: 'price', sortOrder: 'asc' },
  { value: 'price_desc', label: 'السعر: الأعلى', sortBy: 'price', sortOrder: 'desc' },
  { value: 'views', label: 'الأكثر مشاهدة', sortBy: 'views', sortOrder: 'desc' },
];

export function StoreProducts({ storeId, storeName, offersOnly = false }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const page = Number(sp.get('productsPage') ?? 1);
  const highlightId = sp.get('product');
  const sortKey = sp.get('sort') ?? 'newest';
  const sortOpt = SORT_OPTIONS.find((o) => o.value === sortKey) ?? SORT_OPTIONS[0]!;
  const highlightRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useProducts({
    storeId,
    page,
    limit: 12,
    sortBy: sortOpt.sortBy,
    sortOrder: sortOpt.sortOrder,
    ...(offersOnly ? { hasPromotion: true } : {}),
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const highlightedProduct = useMemo(
    () => items.find((p) => p.id === highlightId) ?? null,
    [items, highlightId],
  );

  useEffect(() => {
    if (highlightedProduct) {
      track('PRODUCT_VIEW', {
        productId: highlightedProduct.id,
        categoryId: highlightedProduct.categoryId,
      });
    }
  }, [highlightedProduct]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, items]);

  function setSort(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === 'newest') params.delete('sort');
    else params.set('sort', value);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="ترتيب المنتجات">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                sortKey === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!offersOnly && storeName && (
          <DownloadStoreCatalogButton
            storeId={storeId}
            storeName={storeName}
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 rounded-full text-xs"
          />
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={offersOnly ? 'لا عروض نشطة حاليًا' : 'لا توجد منتجات'}
          description={
            offersOnly
              ? 'لم يضف هذا المتجر عروضًا سارية الآن'
              : 'لم يضف هذا المتجر أي منتج بعد'
          }
        />
      ) : (
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
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.storeDetail(storeId)}
          searchParams={Object.fromEntries(
            Array.from(sp.entries()).filter(([k]) => k !== 'productsPage'),
          )}
          pageParam="productsPage"
        />
      )}

      {!offersOnly && <ProductRecommendations excludeProductId={highlightedProduct?.id} />}
    </div>
  );
}
