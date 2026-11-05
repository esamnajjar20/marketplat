'use client';

import dynamic from 'next/dynamic';
import { ListPageShell, LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { ProductCardSkeleton } from '@/components/shared/skeletons/ProductCardSkeleton';
import { cn } from '@/lib/utils';
import type { BrowsePage } from '@/types/browse.types';
import type { ProductWithStore } from '@/types/product.types';
import type { BrowseSearchParams } from '@/lib/browseSearchParams';

const ProductsGrid = dynamic(
  () => import('@/components/stores/ProductsGrid').then((module) => module.ProductsGrid),
  { loading: () => <BrowseGridLoading label="جارٍ تحميل المنتجات…" /> },
);
const ProductsFilters = dynamic(
  () => import('@/components/stores/ProductsFilters').then((module) => module.ProductsFilters),
  { ssr: false, loading: () => <div className="min-h-20" aria-hidden="true" /> },
);
const ProductsFiltersSheet = dynamic(
  () => import('@/components/stores/ProductsFiltersSheet').then((module) => module.ProductsFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const ProductSearchSortBarWrapper = dynamic(
  () => import('@/components/stores/ProductSearchSortBarWrapper').then((module) => module.ProductSearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const ProductCategoryChips = dynamic(
  () => import('@/components/stores/ProductCategoryChips').then((module) => module.ProductCategoryChips),
  { ssr: false, loading: () => <div className="h-8" aria-hidden="true" /> },
);

function BrowseGridLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3 py-4" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={cn(LIST_CARD_GRID_CLASS)}>
        {Array.from({ length: 6 }, (_, index) => <ProductCardSkeleton key={index} />)}
      </div>
    </div>
  );
}

/**
 * صفحة المنتجات العامة — مطابقة لتصميم المرجع:
 * عنوان بدون أيقونة، شريط بحث، شرائح تصنيفات، ثم شبكة البطاقات.
 */
interface ProductsPageClientProps {
  initialPage?: BrowsePage<ProductWithStore> | null;
  initialPageUpdatedAt?: number;
  searchParams?: BrowseSearchParams;
}

export function ProductsPageClient({ initialPage, initialPageUpdatedAt, searchParams }: ProductsPageClientProps = {}) {
  return (
    <ListPageShell
      title="المنتجات"
      description="تصفح منتجات المتاجر في سوق غزة"
      className="bg-[var(--legacy-page-surface)] dark:bg-background"
      toolbar={
        <div className="flex w-full flex-col gap-3">
          <div className="min-w-0 w-full">
            <ProductSearchSortBarWrapper />
          </div>
          <ProductCategoryChips />
          <div className="lg:hidden">
            <ProductsFiltersSheet />
          </div>
        </div>
      }
      sidebar={<ProductsFilters />}
    >
      <ProductsGrid initialPage={initialPage} initialPageUpdatedAt={initialPageUpdatedAt} searchParams={searchParams} />
    </ListPageShell>
  );
}
