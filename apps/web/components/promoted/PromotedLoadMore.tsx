'use client';

import { useState } from 'react';
import { ProductCard } from '@/components/stores/ProductCard';
import { Button } from '@/components/shared/ui/Button';
import { Spinner } from '@/components/ui/spinner';
import { productsApi } from '@/api/products.api';
import { unwrapData } from '@/lib/apiPagination';
import type { ProductWithStore } from '@/types/product.types';

const PAGE_SIZE = 16;

export function PromotedLoadMore({
  initialPage,
  hasNextPage: initialHasNextPage,
}: {
  initialPage: number;
  hasNextPage: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [items, setItems] = useState<ProductWithStore[]>([]);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function loadNextPage() {
    if (isLoading || !hasNextPage) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const result = await productsApi.getAll({
        hasPromotion: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: page + 1,
        limit: PAGE_SIZE,
      });
      const next = unwrapData(result);
      setItems((current) => [...current, ...next.items]);
      setPage(next.meta.page);
      setHasNextPage(next.meta.hasNextPage);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} storeId={product.store?.id} context="featured" />
          ))}
        </div>
      )}
      {hasError && (
        <p className="text-center text-sm text-destructive" role="alert">
          تعذّر تحميل المزيد من العروض. حاول مرة أخرى.
        </p>
      )}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void loadNextPage()} disabled={isLoading}>
            {isLoading ? <><Spinner size="sm" /> جارٍ التحميل…</> : hasError ? 'إعادة المحاولة' : 'تحميل المزيد'}
          </Button>
        </div>
      )}
    </>
  );
}
