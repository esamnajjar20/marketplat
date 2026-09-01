'use client';

import { Layers } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import type { ProductWithStore } from '@/types/product.types';

interface Props {
  products: ProductWithStore[];
  isLoading?: boolean;
  /** عنوان موحّد مع "إعلانات مشابهة" / "خدمات مشابهة" */
  title?: string;
}

/**
 * قسم "منتجات مشابهة" — نفس بنية RelatedAds:
 * عنوان موحّد + كاروسيل على الموبايل + شبكة على الشاشات الأكبر.
 */
export function RelatedProducts({
  products,
  isLoading = false,
  title = 'منتجات مشابهة',
}: Props) {
  if (isLoading) {
    return (
      <section className="space-y-4 border-t pt-8 pb-28 lg:pb-4">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          {title}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (!products.length) return null;

  return (
    <section className="space-y-4 border-t pt-8 pb-28 lg:pb-4" aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-lg font-bold">
        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      {/* Mobile: horizontal snap carousel — same as RelatedAds */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory sm:hidden [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div key={p.id} className="w-[48%] min-w-[160px] max-w-[220px] shrink-0 snap-start">
            <ProductCard product={p} storeId={p.storeId} />
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-2 sm:grid lg:grid-cols-4 gap-3 stagger-fade-in">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} storeId={p.storeId} />
        ))}
      </div>
    </section>
  );
}
