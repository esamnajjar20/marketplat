import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * Home = Discovery. Above-the-fold stays eager (Hero + categories +
 * featured/recent ads) so first paint is meaningful. Everything below
 * mounts via LazySection so React Query hooks — and their network
 * requests — only fire as the user approaches each block. This cuts
 * the initial parallel fan-out and the cascade of layout jumps on
 * slow mobile networks without removing any discovery rails.
 */
export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />
      <HomeAboveFold />

      {/* Offers first among deferred rails — highest commercial intent. */}
      <LazySection minHeight={280}>
        <PromotedProductsSection />
      </LazySection>

      <LazySection minHeight={300}>
        <RecentProductsSection />
      </LazySection>

      <LazySection minHeight={280}>
        <NearbyProvidersSection />
      </LazySection>

      <LazySection minHeight={280}>
        <FeaturedStoresSection />
      </LazySection>

      {/* Personalized rail last — often empty for anonymous visitors. */}
      <LazySection minHeight={260}>
        <RecommendedAds />
      </LazySection>
    </div>
  );
}
