import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { ProductsFilters } from '@/components/stores/ProductsFilters';
import { ProductsFiltersSheet } from '@/components/stores/ProductsFiltersSheet';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

export default function ProductsPage() {
  return (
    <ListPageShell
      icon={<ShoppingBag className="h-6 w-6" />}
      title="المنتجات"
      description="تصفح منتجات المتاجر في سوق غزة"
      toolbar={
        <Suspense>
          <ProductsFiltersSheet />
        </Suspense>
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
