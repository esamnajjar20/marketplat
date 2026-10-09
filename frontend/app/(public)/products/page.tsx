import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { ProductsFilters } from '@/components/stores/ProductsFilters';
import { ProductsFiltersSheet } from '@/components/stores/ProductsFiltersSheet';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { ProductSearchSortBarWrapper } from '@/components/stores/ProductSearchSortBarWrapper';

// @418-FIX: same pattern as /ads — force-dynamic + no in-page Suspense.
// useSearchParams() in the child components forced Next to wrap the
// route in a Suspense boundary that streamed a fallback shell and then
// hydrated against a different tree → React #418 args[]=HTML.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

export default function ProductsPage() {
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
