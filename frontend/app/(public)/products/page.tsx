import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { ProductsFilters } from '@/components/stores/ProductsFilters';
import { ProductsFiltersSheet } from '@/components/stores/ProductsFiltersSheet';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { ProductSearchSortBarWrapper } from '@/components/stores/ProductSearchSortBarWrapper';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

export default function ProductsPage() {
  return (
    <ListPageShell
      icon={<ShoppingBag className="h-6 w-6" />}
      title="المنتجات"
      description="تصفح منتجات المتاجر في سوق غزة"
      toolbar={
        <>
          <Suspense><ProductsFiltersSheet /></Suspense>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto"><Suspense><ProductSearchSortBarWrapper /></Suspense></div>
        </>
      }
      sidebar={
        <Suspense>
          <ProductsFilters />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز القائمة…" />
        }
      >
        <ProductsGrid />
      </Suspense>
    </ListPageShell>
  );
}
