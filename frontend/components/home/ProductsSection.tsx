'use client';

import { ShoppingBag } from 'lucide-react';
import { RecentProducts } from './RecentProducts';
import { useProducts } from '@/hooks/queries/useProducts';

const DISPLAY_COUNT = 8;

/**
 * Plan §5/§14: owns its own heading (same reasoning as RecommendedAds)
 * because the section must disappear as a whole — heading included —
 * when there are genuinely zero products marketplace-wide. Reads the
 * same query RecentProducts renders (identical key → same cache entry,
 * no duplicate request) purely to decide whether to show the heading.
 */
export function ProductsSection() {
  const { data, isLoading } = useProducts({ limit: DISPLAY_COUNT, sortBy: 'createdAt', sortOrder: 'desc' });

  if (!isLoading && data?.items.length === 0) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      <div className="flex items-end justify-between gap-3 border-b pb-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" />
            جديد
          </p>
          <h2 className="text-lg font-bold sm:text-xl">أحدث المنتجات</h2>
        </div>
      </div>
      <RecentProducts />
    </section>
  );
}
