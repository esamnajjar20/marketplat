'use client';

import Link from 'next/link';
import { ShoppingBag, Clock, LocateFixed } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ProductCard } from '@/components/stores/ProductCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { useProducts } from '@/hooks/queries/useProducts';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { FEATURES } from '@/lib/featureFlags';
import { ROUTES } from '@/lib/constants';

/**
 * FEAT-HOME-DISCOVERY: "أحدث المنتجات" Home section — deliberately
 * named "أحدث" (recent), not "مميزة" (featured): Product has no
 * isFeatured concept in the schema (unlike Ad), and no store.plan
 * link either, so this section is genuinely createdAt DESC, same
 * useProducts() hook /products itself uses, just capped to 8 with no
 * pagination controls (pagination belongs to the full /products page,
 * not this homepage teaser).
 *
 * Self-contained like NearbyProvidersSection (own heading, own
 * loading/empty state) rather than folded into HomeAboveFold's
 * coordinated skeleton — see that file's doc for why. Horizontal-
 * scroll-on-mobile layout per the Home discovery spec, unlike
 * RecentAds' stacked grid-on-mobile.
 *
 * Phase 4: GET /products has no lat/lng param (audit §3) — only
 * `city` — so only the resolver's 'city' source maps to anything here;
 * gps-current/gps-saved/fallback all fall through to the general,
 * unfiltered recent list rather than guessing a city from coordinates.
 * This section never disappears or blocks on location either way.
 */
export function RecentProductsSection() {
  const location = useLocationResolver();
  const city = location.source === 'city' ? location.city : undefined;
  const { data, isLoading, isError, error, refetch } = useProducts({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc', city });
  const items = data?.items ?? [];
  const isAuth = useAuthStore(selectIsAuthenticated);

  // FIX UI-REVIEW-3: this section resolves the exact same city-vs-
  // fallback location split as NearbyProvidersSection/HomeAboveFold's
  // "أحدث الإعلانات" — city genuinely reorders these results (unlike
  // FeaturedStoresSection, where plan-based ranking dominates and city
  // only affects backfill) — but had no "استخدام موقعي" CTA or source
  // badge, so a user who hadn't granted location here had no way to
  // improve these particular results, unlike the two sibling sections
  // that already offer it. Same pattern, same copy, same placement.
  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';
  // FEATURE-FLAG-GPS: hide the CTA when GPS is off.
  const showLocateCta = FEATURES.GPS_LOCATION && !isGps;
  // Maps useLocationResolver's 4-way source to LocationSourceBadge's
  // 3-way display union. No cascade-to-general case to account for
  // here (unlike useAdsForHome/useNearbyProvidersForHome) — city is
  // passed straight through to useProducts and always takes effect
  // when present, so the resolver's own source is an accurate label
  // for what's actually shown.
  const badgeSource = isGps ? 'gps' as const : location.source === 'city' ? 'city' as const : 'general' as const;
  const badgeCity = location.source === 'city' ? location.city : undefined;

  const header = (
    <SectionHeader
      eyebrow="الأحدث"
      title="أحدث المنتجات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.products, label: 'عرض الكل ←' }}
      badge={!isLoading ? <LocationSourceBadge source={badgeSource} city={badgeCity} /> : undefined}
    />
  );

  if (isLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-40 shrink-0 sm:w-auto">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // FIX UI-REVIEW-ERROR-STATE: same bug as RecentAds — a failed
  // request used to fall straight into the empty-items branch below
  // and show "لا توجد منتجات بعد" (no products yet), which is wrong
  // on an established marketplace and misleads a user with a real
  // connectivity problem into thinking there's simply nothing there.
  if (isError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10">
        {header}
        <ApiError error={error} onRetry={refetch} variant="inline" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10">
        {header}
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="لا توجد منتجات بعد"
          description={isAuth ? 'افتح متجرك وأضف أول منتج' : 'سجّل دخولك وافتح متجرك لإضافة منتجات'}
          action={
            isAuth ? (
              <Button asChild size="sm">
                <Link href={ROUTES.myStoreProductCreate}>إضافة منتج</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.myStoreProductCreate)}`}>
                  تسجيل الدخول
                </Link>
              </Button>
            )
          }
        />
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10">
      {header}
      {showLocateCta && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={location.requestLocation}>
          <LocateFixed className="h-3.5 w-3.5" />
          استخدام موقعي
        </Button>
      )}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 md:grid-cols-3 lg:grid-cols-4 stagger-fade-in">
        {items.map((product) => (
          <div key={product.id} className="w-40 shrink-0 sm:w-auto">
            <ProductCard product={product} storeId={product.store.id} />
          </div>
        ))}
      </div>
    </section>
  );
}
