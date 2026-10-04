'use client';

import Link from 'next/link';
import { ShoppingBag, Clock } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ProductCard } from '@/components/stores/ProductCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { homeSectionLimit } from '@/lib/listLimits';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';
import { useDataSaver } from '@/lib/useDataSaver';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { forYouIdsOf, useForYouItems } from '@/hooks/queries/useForYouItems';

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
 * Location: browse city when selected, otherwise general results.
 * The homepage does not use GPS for this section.
 */
export function RecentProductsSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(8, 4, dataSaver);
  const feed = useHomeFeed();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const rail = feed.data?.rails.products;
  const promotedIds = collectIds(feed.data?.featured.carousel.products?.items);
  const shownAbove = forYouIdsOf(useForYouItems(), 'product');
  for (const id of shownAbove) promotedIds.add(id);
  const items = dedupeKeepingMin(rail?.items ?? [], promotedIds).slice(0, limit);
  const showLoading = feed.isPending;
  const showError = feed.isError;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="منتجات تناسبك"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.products, label: 'عرض الكل ←' }}
      badge={!showLoading ? <LocationSourceBadge source={rail?.source ?? 'general'} quiet /> : undefined}
    />
  );

  if (showLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
        {header}
        <HomeScrollRail>
          {Array.from({ length: 8 }).map((_, i) => (
            <HomeScrollRailItem key={i}>
              <ProductCardSkeleton />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      </section>
    );
  }

  if (showError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
        {header}
        <ApiError error={feed.error} onRetry={() => void feed.refetch()} variant="inline" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
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
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
      {header}
      <HomeScrollRail className="stagger-fade-in">
        {items.map((product) => (
          <HomeScrollRailItem key={product.id}>
            <ProductCard product={product} storeId={product.store.id} context="public" />
          </HomeScrollRailItem>
        ))}
      </HomeScrollRail>
    </section>
  );
}
