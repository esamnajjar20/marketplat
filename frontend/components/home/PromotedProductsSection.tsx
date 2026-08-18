'use client';

import { Flame } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';

/**
 * PROMO-1 (Phase 10 of the promotions design doc): "عروض مميزة" Home
 * section — products currently carrying a live Promotion. Structurally
 * identical to RecentProductsSection.tsx (same horizontal-scroll-on-
 * mobile layout, same skeleton count, same self-hide-when-empty
 * behavior) with one deliberate difference: this section renders
 * nothing at all when there are no live promotions, rather than
 * RecentProductsSection's EmptyState treatment — "no offers right now"
 * is not something worth a dedicated empty-state message on the
 * homepage the way "no products yet" is for a brand-new marketplace;
 * it should just not take up space.
 *
 * Uses GET /products?hasPromotion=true — see products.validation.ts's
 * getProductsSchema doc comment: this is the minimal Phase 10 slice of
 * the fuller Phase 12 filter design (no UI checkbox, no combination
 * with other filters here), added specifically to unblock this
 * section rather than block Phase 10 on Phase 12's full scope.
 *
 * Not location-filtered (unlike RecentProductsSection) — an active
 * store-wide discount is worth surfacing regardless of city, and
 * Product has no lat/lng to filter by regardless (see products
 * module's existing city-only location support).
 */
export function PromotedProductsSection() {
  const { data, isLoading } = useProducts({
    limit: 8,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    hasPromotion: true,
  });
  const items = data?.items ?? [];

  const header = (
    <SectionHeader
      eyebrow="لا تفوّتها"
      title="عروض مميزة"
      icon={<Flame className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.products}?hasPromotion=true`, label: 'عرض الكل ←' }}
    />
  );

  if (isLoading) {
    return (
      <section className="container mx-auto space-y-4 px-4 pt-10">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 sm:w-auto">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Self-hides entirely when there are no live promotions — see this
  // component's doc comment for why (no EmptyState here, unlike
  // RecentProductsSection).
  if (items.length === 0) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
        {items.map((product) => (
          <div key={product.id} className="w-40 shrink-0 sm:w-auto">
            <ProductCard product={product} storeId={product.store.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
