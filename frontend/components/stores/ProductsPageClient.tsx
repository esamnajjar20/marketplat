'use client';

import dynamic from 'next/dynamic';
import { ListPageShell } from '@/components/shared/list/ListPageShell';

const ProductsGrid = dynamic(
  () => import('@/components/stores/ProductsGrid').then((module) => module.ProductsGrid),
  { ssr: false, loading: () => <BrowseGridLoading label="جارٍ تحميل المنتجات…" /> },
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
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

/**
 * صفحة المنتجات العامة — مطابقة لتصميم المرجع:
 * عنوان بدون أيقونة، شريط بحث، شرائح تصنيفات، ثم شبكة البطاقات.
 */
export function ProductsPageClient() {
  return (
    <ListPageShell
      title="المنتجات"
      description="تصفح منتجات المتاجر في سوق غزة"
      className="bg-[#FBF9F4] dark:bg-background"
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
      <ProductsGrid />
    </ListPageShell>
  );
}
