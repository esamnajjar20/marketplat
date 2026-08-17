import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

/**
 * Plan §10: public cross-store product browse page. Header treatment
 * matches /stores (icon-badge + heading). Deliberately no filter
 * sidebar in this pass (plan §22 — smallest solution first); search/
 * category/sort are still reachable via ProductsGrid's URL params,
 * same as StoresGrid before StoresFilters existed.
 */
export default function ProductsPage() {
  return (
    <div className="pb-8">
      <div className="border-b bg-secondary/40">
        <div className="container mx-auto flex items-center gap-3 px-4 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">المنتجات</h1>
            <p className="text-sm text-muted-foreground">تصفح منتجات كل المتاجر في سوق غزة</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6">
        <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
          <ProductsGrid />
        </Suspense>
      </div>
    </div>
  );
}
