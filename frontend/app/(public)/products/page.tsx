import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShoppingBag } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ProductsGrid } from '@/components/stores/ProductsGrid';
import { ProductsFilters } from '@/components/stores/ProductsFilters';
import { ProductsFiltersSheet } from '@/components/stores/ProductsFiltersSheet';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

/**
 * FEAT-HOME-DISCOVERY: public cross-store products browse page — the
 * Home "منتجات مميزة" section's "عرض الكل" destination. Same
 * icon-badge + heading header treatment as /stores/page.tsx and
 * /services/page.tsx for visual consistency across the three
 * "browse + " list pages.
 *
 * PROMO-1 (Phase 12, full scope): ProductsGrid already read
 * search/city/sortBy/sortOrder/hasPromotion from the URL exactly like
 * StoresGrid does — this page previously had no filter UI at all
 * (unlike /stores, /services), which was a known gap called out in
 * this doc comment before this pass. ProductsFilters/
 * ProductsFiltersSheet now expose that (search/city/hasPromotion),
 * added the same way StoresFilters was for /stores (FIX BUG-02 there).
 * No sort UI added here — ProductsGrid reads sortBy/sortOrder from the
 * URL but nothing currently sets them; that's a separate gap, not part
 * of this filter pass.
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

      <div className="container mx-auto px-4 pt-6 space-y-6">
        <Suspense>
          <ProductsFiltersSheet />
        </Suspense>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <Suspense><ProductsFilters /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <ProductsGrid />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
