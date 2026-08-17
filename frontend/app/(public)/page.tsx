import type { Metadata } from 'next';
import { HeroBanner }   from '@/components/home/HeroBanner';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { ProductsSection } from '@/components/home/ProductsSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { StoresSection } from '@/components/home/StoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

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

      {/*
        Marketplace Discovery Home (plan §2/§4): Ads (above, inside
        HomeAboveFold) → Products → nearby Providers → Stores. Each
        section is independently queried and independently self-hiding
        (plan §14/§15) — a failure or empty result in one never takes
        down the others, and each disappears as a whole (heading
        included) rather than showing an empty block.
      */}
      <ProductsSection />
      <NearbyProvidersSection />
      <StoresSection />

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
