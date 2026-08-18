import type { Metadata } from 'next';
import { HeroBanner }   from '@/components/home/HeroBanner';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * FEAT-HOME-DISCOVERY: Home = Discovery, not a single mixed feed.
 * Order matches the agreed Home layout exactly:
 *   Search (HeroBanner) → Categories → أحدث الإعلانات (both inside
 *   HomeAboveFold) → أحدث المنتجات → مقدمو الخدمات القريبون منك →
 *   متاجر مميزة.
 * Each of the three new sections is self-contained (own heading, own
 * loading/empty/self-hide behavior — see each file's own doc) and
 * mounted independently here, same as RecommendedAds already was,
 * rather than folded into HomeAboveFold's coordinated skeleton — see
 * HomeAboveFold's comment for why.
 */
export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />

      {/*
        FIX UX-GAP-03: Category/Featured/Recent used to each manage
        their own loading state independently, which meant the page
        settled in three separate, staggered jumps as each section's
        request resolved at a different time. HomeAboveFold reads all
        three underlying queries and renders one coordinated skeleton
        (or the real sections) together — see its own comment for why.
      */}
      <HomeAboveFold />

      {/* FEAT-HOME-DISCOVERY: أحدث المنتجات → /products */}
      <RecentProductsSection />

      {/*
        FEAT-HOME-NEARBY-PROVIDERS: مقدمو الخدمات القريبون منك.
        Phase 4: driven by useNearbyProvidersForHome's full location
        priority chain (gps-current/gps-saved → nearby search; city →
        city directory; fallback → general directory), with a cascade
        to the general directory if the GPS/city query fails or comes
        back empty — never permanently hidden for lack of location.
        Only hides itself when even that general fallback is genuinely
        empty. See the component's own doc for the full breakdown.
      */}
      <NearbyProvidersSection />

      {/* FEAT-HOME-DISCOVERY: متاجر مميزة → /stores */}
      <FeaturedStoresSection />

      {/*
        Gap #9: personalized for a returning visitor (favorites/views/
        created ads), trending for everyone else. RecommendedAds owns
        its own heading and section wrapper (see its own comment) so it
        can disappear as a whole when it has nothing worth showing.
        Left out of the above-the-fold loading coordination on purpose —
        it's below the fold and already self-hides cleanly.
      */}
      <RecommendedAds />
    </div>
  );
}
