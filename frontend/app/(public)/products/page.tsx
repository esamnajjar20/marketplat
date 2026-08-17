import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

/**
 * FEAT-HOME-DISCOVERY: public cross-store products browse page — the
 * Home "منتجات مميزة" section's "عرض الكل" destination. Same
 * icon-badge + heading header treatment as /stores/page.tsx and
 * /services/page.tsx for visual consistency across the three
 * "browse + " list pages.
 *
 * No filter sidebar (unlike /stores, /services): ProductsGrid already
 * reads search/city/sortBy/sortOrder from the URL exactly like
 * StoresGrid does, but this pass only needed a working browse page
 * backed by the existing useProducts() hook — not a new
 * ProductsFilters/ProductsFiltersSheet component pair. Can be added
 * later the same way StoresFilters was, without touching this page's
 * data layer.
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
            <p className="text-sm text-muted-foreground">تصفح منتجات المتاجر في سوق غزة</p>
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
