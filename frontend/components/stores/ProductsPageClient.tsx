'use client';

import dynamic from 'next/dynamic';
import { ShoppingBag } from 'lucide-react';
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

function BrowseGridLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3 py-4" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

/** Browser/URL-bound list widgets mount after hydration to keep the initial HTML deterministic. */
export function ProductsPageClient() {
  return (
    <ListPageShell
      icon={<ShoppingBag className="h-6 w-6" />}
      title="المنتجات"
      description="تصفح منتجات المتاجر في سوق غزة"
      toolbar={
        <>
          <ProductsFiltersSheet />
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <ProductSearchSortBarWrapper />
          </div>
        </>
      }
      sidebar={<ProductsFilters />}
    >
      <ProductsGrid />
    </ListPageShell>
  );
}
