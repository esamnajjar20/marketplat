'use client';

import { Sparkles, Clock, LocateFixed } from 'lucide-react';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { FeaturedAds }  from '@/components/home/FeaturedAds';
import { RecentAds }    from '@/components/home/RecentAds';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { Button }       from '@/components/shared/ui/Button';
import { Skeleton }     from '@/components/shared/ui/Skeleton';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useCategories } from '@/hooks/queries/useCategories';
import { useAds }       from '@/hooks/queries/useAds';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { ROUTES }       from '@/lib/constants';

/**
 * FIX UX-GAP-03: CategoryGrid, FeaturedAds, and RecentAds each ran
 * their own useQuery with an independent isLoading flag, so the
 * homepage settled in three separate, differently-timed jumps —
 * whichever section's request resolved first pushed every section
 * below it down, then the next one did the same, then the next.
 *
 * This wrapper calls the *same* three hooks (identical query keys, so
 * React Query serves the same in-flight/cached request — no
 * duplicate network calls) purely to read their combined loading
 * state. Until every section's data has resolved at least once, the
 * whole block renders one coordinated skeleton shaped like the real
 * layout; once all three are ready, it swaps in the actual sections
 * together in a single paint instead of a cascade.
 *
 * RecommendedAds is deliberately left out of this coordination — it
 * already owns its own self-hiding behavior (renders nothing at all
 * when empty) and sits below the fold, so its independent timing
 * doesn't compound the above-the-fold jump this fix targets.
 *
 * FEAT-HOME-DISCOVERY: same reasoning kept RecentProductsSection,
 * NearbyProvidersSection, and FeaturedStoresSection out of this
 * coordination too — each is a self-contained, self-hiding section
 * (own heading + own loading/empty state) mounted independently in
 * page.tsx below HomeAboveFold, not folded into this wrapper's
 * "wait for everything, then paint once" logic. Coordinating those in
 * too would mean the whole homepage waits on the slowest of them —
 * including NearbyProvidersSection's async permission check — before
 * showing anything at all, which is the opposite of what a Discovery
 * homepage should do.
 *
 * Ads location-awareness: "الأحدث/أحدث الإعلانات" now reads
 * useAdsForHome (GPS → /search?type=ads&sort=distance, city →
 * /ads?city=, fallback → /ads) instead of a plain useAds call — this
 * wrapper calls the *same* hook (not a re-derived query) so the
 * coordinated skeleton's timing and the badge/CTA shown here track
 * exactly what RecentAds itself ends up rendering, same "identical
 * query, no duplicate request" principle as categoriesLoading/
 * featuredLoading above. The CTA ("استخدام موقعي") and location badge
 * live here, next to SectionHeader, rather than inside RecentAds,
 * since SectionHeader (title/heading row) is this file's
 * responsibility both in the loading and loaded branches.
 */

export function HomeAboveFold() {
  const { isLoading: categoriesLoading } = useCategories();
  // UX-FIX (audit P2-01): was useAds({ limit: 20 }) — a different query
  // key than FeaturedAds' own useAds({ isFeatured: true, limit: 4 }),
  // so this fired a second, unnecessary request and its loading flag
  // didn't actually track the Featured section it's meant to
  // coordinate. Matched exactly to FeaturedAds.tsx's real query so
  // React Query serves the same cache entry (no duplicate request) and
  // the coordinated skeleton's timing reflects what's actually shown.
  const { isLoading: featuredLoading } = useAds({ isFeatured: true, limit: 4 });
  const { isChecking: recentChecking, isLoading: recentLoading, source: recentSource, radiusKm: recentRadiusKm } = useAdsForHome();
  const location = useLocationResolver();

  const stillLoading = categoriesLoading || featuredLoading || recentChecking || recentLoading;

  // Only rendered for city-source results — LocationSourceBadge itself
  // no-ops gracefully to "نتائج مقترحة" when city is undefined, but
  // resolving it once here keeps both the loading- and loaded-branch
  // headings trivially in sync with what RecentAds ends up showing.
  const badgeCity = location.source === 'city' ? location.city : undefined;

  const latestAdsHeadingLoading = (
    <SectionHeader
      eyebrow="الأحدث"
      title="أحدث الإعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
    />
  );

  const latestAdsHeadingLoaded = (
    <SectionHeader
      eyebrow="الأحدث"
      title="أحدث الإعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
      badge={<LocationSourceBadge source={recentSource} city={badgeCity} radiusKm={recentRadiusKm} />}
    />
  );

  // GPS CTA: only shown when there's actually something for the user
  // to gain by pressing it — permission not yet granted and no saved
  // GPS already covering the request (matches the section-3/4 rule
  // that gps-saved is used automatically, silently, without a popup;
  // the CTA is specifically the "prompt an explicit browser permission
  // request" escape hatch, never shown while already resolved to a
  // GPS source and never auto-triggered on mount by this component).
  const showLocateCta = location.source !== 'gps-current' && location.source !== 'gps-saved';

  if (stillLoading) {
    return (
      <>
        <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-8">
          <SectionHeader eyebrow="تصفح حسب الفئة" title="ماذا تبحث عنه؟" />
          <div className="flex gap-2 overflow-x-auto sm:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-3 sm:grid md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </section>

        <section className="relative mt-6 border-y border-accent/15 bg-gradient-to-b from-accent/[0.12] to-accent/[0.04] py-7 sm:mt-10 sm:py-12">
          <div className="container relative mx-auto max-w-7xl space-y-5 px-4">
            <SectionHeader
              tone="featured"
              eyebrow="مختارة لأجلك"
              title="إعلانات مميزة"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              cta={{ href: `${ROUTES.search}?type=ads`, label: 'كل الإعلانات ←' }}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <AdCardSkeleton key={i} />)}
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-10">
          {latestAdsHeadingLoading}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 stagger-fade-in">
            {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-8">
        <SectionHeader eyebrow="تصفح حسب الفئة" title="ماذا تبحث عنه؟" />
        <CategoryGrid />
      </section>

      <section className="relative mt-6 border-y border-accent/15 bg-gradient-to-b from-accent/[0.12] to-accent/[0.04] py-7 sm:mt-10 sm:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-10 top-0 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="container relative mx-auto max-w-7xl space-y-5 px-4">
          <SectionHeader
            tone="featured"
            eyebrow="مختارة لأجلك"
            title="إعلانات مميزة"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            cta={{ href: `${ROUTES.search}?type=ads`, label: 'كل الإعلانات ←' }}
          />
          <FeaturedAds />
        </div>
      </section>

      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-8 sm:pt-10">
        {latestAdsHeadingLoaded}
        {showLocateCta && (
          <div className="-mt-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={location.requestLocation}>
              <LocateFixed className="h-3.5 w-3.5" />
              استخدام موقعي
            </Button>
          </div>
        )}
        <RecentAds />
      </section>
    </>
  );
}
