'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ProductCard } from '@/components/stores/ProductCard';
import { Button } from '@/components/shared/ui/Button';
import { Spinner } from '@/components/ui/spinner';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { productsApi } from '@/api/products.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { ROUTES } from '@/lib/constants';
import { Flame } from 'lucide-react';
import type { ProductWithStore } from '@/types/product.types';
import type { PaginationMeta } from '@/types/api.types';

const PAGE_SIZE = 16;
type PromotedPage = { items: ProductWithStore[]; meta: PaginationMeta };

/**
 * The first page is hydrated by the Server Component. Later pages share the
 * same infinite-query cache, cancellation, retry and invalidation lifecycle
 * instead of living in a private useState array.
 */
export function PromotedLoadMore({ hasServerSeed }: { hasServerSeed: boolean }) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.products.promotedInfinite(PAGE_SIZE),
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<PromotedPage> => {
      const response = await productsApi.getAll({
        hasPromotion: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: pageParam,
        limit: PAGE_SIZE,
      }, { signal });
      return response.data.data as PromotedPage;
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    staleTime: CACHE_TTL.adsList,
  });

  const pages = query.data?.pages ?? [];
  // The Server Component renders page one as RSC cards. Skip that cached page
  // here when it was seeded to avoid duplicating the same products; when SSR
  // failed, render every page fetched by this client fallback.
  const visiblePages = hasServerSeed ? pages.slice(1) : pages;
  const products = visiblePages.flatMap((page) => page.items ?? []);
  const total = pages[0]?.meta.total ?? 0;

  if (query.isPending && pages.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" role="status" aria-label="جارٍ تحميل العروض">
        {Array.from({ length: 8 }, (_, index) => <AdCardSkeleton key={index} density="compact" />)}
      </div>
    );
  }

  if (query.isError && pages.length === 0) {
    return (
      <div className="space-y-3 text-center" role="alert">
        <p className="text-sm text-destructive">تعذّر تحميل العروض المروّجة.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <>
      {pages.length > 0 && total === 0 ? (
        <EmptyState
          icon={<Flame className="h-8 w-8" />}
          title="لا عروض مروَّجة حالياً"
          description="عند تفعيل المتاجر لعروض جديدة ستظهر هنا."
          action={<Link href={ROUTES.products} className="text-sm font-medium text-primary" prefetch={false}>تصفّح كل المنتجات</Link>}
        />
      ) : null}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} storeId={product.store?.id} context="featured" />
          ))}
        </div>
      )}
      {query.isError && pages.length > 0 ? (
        <p className="text-center text-sm text-destructive" role="alert">تعذّر تحميل المزيد من العروض. حاول مرة أخرى.</p>
      ) : null}
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? <><Spinner size="sm" /> جارٍ التحميل…</> : query.isError ? 'إعادة المحاولة' : 'تحميل المزيد'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
