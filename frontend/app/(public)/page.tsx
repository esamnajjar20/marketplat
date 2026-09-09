import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeTrustStrip } from '@/components/home/HomeTrustStrip';
import { HomeQuickActions } from '@/components/home/HomeQuickActions';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * رئيسية: هيرو → ثقة → اكتشاف → أدوات → بقية الأقسام
 */
export default function HomePage() {
  return (
    <div className="pb-10">
      <HeroBanner />
      <div className="pt-3 sm:pt-4">
        <HomeQuickActions />
      </div>
      <div className="pt-3 sm:pt-4">
        <HomeTrustStrip />
      </div>
      <HomeAboveFold />
      {/* FEAT-HOME-NEARBY-PROVIDERS: mounted independently below
          HomeAboveFold, deliberately outside its coordinated-skeleton
          logic — see HomeAboveFold's own doc comment for why. */}
      <LazySection minHeight={280} rootMargin="100px 0px">
        <NearbyProvidersSection />
      </LazySection>
      <LazySection minHeight={280} rootMargin="100px 0px">
        <PromotedProductsSection />
      </LazySection>
      <LazySection minHeight={300} rootMargin="80px 0px">
        <RecentProductsSection />
      </LazySection>
      <LazySection minHeight={280} rootMargin="80px 0px">
        <HomeServicesSection />
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
