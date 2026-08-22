'use client';

import { Flame } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { ApiError } from '@/components/shared/ApiError';
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
  const { data, isLoading, isError, error, refetch } = useProducts({
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
    // FIX UI-REVIEW-2: matches the loaded-state background below so
    // there's no visual flash/shift from white → accent band once
    // data resolves.
    return (
      <section className="border-y bg-accent/[0.06] py-10">
        <div className="container mx-auto space-y-4 px-4">
          {header}
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-40 shrink-0 sm:w-auto">
                <ProductCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // FIX UI-REVIEW-ERROR-STATE: previously fell straight into the
  // self-hide-on-empty branch below on a failed request too — same
  // "silently vanish" bug as this component's sibling sections. This
  // one is worth flagging especially clearly since it renders inside
  // its own bg-accent band (see below): a failed fetch here used to
  // mean the accent band never appeared at all, not even to show an
  // error, so nothing about a real connectivity problem was visible
  // anywhere on this stretch of the page.
  if (isError) {
    return (
      <section className="border-y bg-accent/[0.06] py-10">
        <div className="container mx-auto space-y-4 px-4">
          {header}
          <ApiError error={error} onRetry={refetch} variant="inline" />
        </div>
      </section>
    );
  }

  // Self-hides entirely when there are no live promotions — see this
  // component's doc comment for why (no EmptyState here, unlike
  // RecentProductsSection).
  if (items.length === 0) return null;

  // FIX UI-REVIEW-2: matches HomeAboveFold's "إعلانات مميزة" section
  // (bg-accent/[0.06] border-y band) instead of the plain white
  // background every other Home section uses. Both sections carry the
  // same commercial weight — one ad-side, one product-side — so
  // treating only the ad section as visually "featured" made the
  // distinction look accidental rather than a deliberate "these two
  // are the paid/promoted moments" signal. Kept as its own <section>
  // (not merged into HomeAboveFold) since this component still owns
  // its independent self-hide-when-empty timing — see this file's
  // top-level doc comment.
  return (
    <section className="border-y bg-accent/[0.06] py-10">
      <div className="container mx-auto space-y-4 px-4">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4 stagger-fade-in">
          {items.map((product) => (
            <div key={product.id} className="w-40 shrink-0 sm:w-auto">
              <ProductCard product={product} storeId={product.store.id} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
