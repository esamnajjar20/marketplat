import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeQuickActions } from '@/components/home/HomeQuickActions';
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
 * N3: below-the-fold sections use a tighter rootMargin and recommendations
 * wait for idle time so weak nets don't fire 5 list queries at once.
 */
export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />
      <HomeQuickActions />
      <HomeAboveFold />
      <LazySection minHeight={280} rootMargin="100px 0px">
        <PromotedProductsSection />
      </LazySection>
      <LazySection minHeight={300} rootMargin="80px 0px">
        <RecentProductsSection />
      </LazySection>
      <LazySection minHeight={280} rootMargin="80px 0px">
        <NearbyProvidersSection />
      </LazySection>
      <LazySection minHeight={280} rootMargin="60px 0px">
        <FeaturedStoresSection />
      </LazySection>
      <LazySection minHeight={260} rootMargin="40px 0px" whenIdle>
        <RecommendedAds />
      </LazySection>
    </div>
  );
}
