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
 * SLOW-NET phase2 — above the fold only:
 *   Hero + quick actions + trust + HomeAboveFold (categories + featured + recent).
 * Everything else mounts near viewport, and on slow links uses whenIdle so
 * the first paint is not competing with secondary section queries.
 */
export default function HomePage() {
  return (
    <div className="pb-12 sm:pb-16">
      <HeroBanner />

      <div className="space-y-5 sm:space-y-7">
        <HomeQuickActions />
        <HomeTrustStrip />
      </div>

      {/* اكتشاف أساسي — فوق الطية، بدون تأجيل */}
      <div className="mt-2">
        <HomeAboveFold />
      </div>

      {/* تحت الطية: تأجيل أقوى على النت البطيء (LazySection يضيّق rootMargin) */}
      <div className="mt-2">
        <LazySection minHeight={240} rootMargin="48px 0px" whenIdle>
          <RecommendedAds />
        </LazySection>
      </div>

      <div className="mt-4 space-y-1 sm:mt-6">
        <LazySection minHeight={260} rootMargin="48px 0px" whenIdle>
          <NearbyProvidersSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="64px 0px" whenIdle>
          <PromotedProductsSection />
        </LazySection>
        <LazySection minHeight={280} rootMargin="64px 0px" whenIdle>
          <RecentProductsSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
          <HomeServicesSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
          <FeaturedStoresSection />
        </LazySection>
      </div>
    </div>
  );
}
