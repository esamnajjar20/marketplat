import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { HomeSafeBuyingTips } from '@/components/home/HomeSafeBuyingTips';
import { HomeGuestPublishBar } from '@/components/home/HomeGuestPublishBar';
import { HomeBrowseLinks } from '@/components/home/HomeBrowseLinks';
import { HomeAppPromo } from '@/components/home/HomeAppPromo';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { HomeBusyBoundary } from '@/components/home/HomeBusyBoundary';
import { LazySection } from '@/components/shared/LazySection';

/**
 * Homepage body (client tree). Kept separate from app/(public)/page.tsx so
 * the page can be an async server component (prefetch + hydration) while this
 * stays trivially renderable in tests.
 *
 * Layout (user brief):
 * 1. Featured mixed carousel (ads / products / stores / services)
 * 2. Mixed categories with type under each chip
 * 3. "For you" mixed recommendations (trending for guests)
 * 4. Per-type horizontal rails with "view all"
 */
export function HomePageContent() {
  return (
    <div className="pb-12 sm:pb-16">
      <HomeBusyBoundary>
        {/* 1–2: carousel + categories (+ ads rail in HomeAboveFold) */}
        <EagerHomeSections />

        <div className="mt-6 space-y-8 sm:mt-8 sm:space-y-10">
          {/* 3: personalized / trending mixed */}
          <LazySection minHeight={300} rootMargin="48px 0px" whenIdle>
            <ForYouMixedSection />
          </LazySection>

          {/* 4: type rails */}
          <LazySection minHeight={320} rootMargin="48px 0px" whenIdle>
            <RecentProductsSection />
          </LazySection>

          <LazySection minHeight={300} rootMargin="64px 0px" whenIdle>
            <HomeServicesSection />
          </LazySection>

          <LazySection minHeight={300} rootMargin="64px 0px" whenIdle>
            <FeaturedStoresSection />
          </LazySection>

          <LazySection minHeight={300} rootMargin="80px 0px" whenIdle>
            <PromotedProductsSection />
          </LazySection>

          <LazySection minHeight={300} rootMargin="80px 0px" whenIdle>
            <NearbyProvidersSection />
          </LazySection>
        </div>

        <div className="mt-8 space-y-4 sm:mt-10">
          <HomeAppPromo />
          <HomeSafeBuyingTips />
          <HomeBrowseLinks />
        </div>
      </HomeBusyBoundary>

      <HomeGuestPublishBar />
    </div>
  );
}
