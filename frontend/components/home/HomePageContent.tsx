'use client';

import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { HomeAppPromo } from '@/components/home/HomeAppPromo';
import { HomeBrowseLinks } from '@/components/home/HomeBrowseLinks';
import { HomeSafeBuyingTips } from '@/components/home/HomeSafeBuyingTips';
import { HomeGuestPublishBar } from '@/components/home/HomeGuestPublishBar';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { HomeBusyBoundary } from '@/components/home/HomeBusyBoundary';
import { LazySection } from '@/components/shared/LazySection';

/**
 * Homepage body — single consistent stack on mobile and desktop.
 * Horizontal rails (2×2 visible) handle density; no duplicate layouts per breakpoint.
 */
export function HomePageContent() {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-16 md:pb-16">
      <HomeBusyBoundary>
        <EagerHomeSections />

        <div className="mt-4 space-y-6 sm:mt-8 sm:space-y-8">
          <LazySection minHeight={280} rootMargin="40px 0px" whenIdle>
            <ForYouMixedSection />
          </LazySection>

          <LazySection minHeight={280} rootMargin="48px 0px" whenIdle>
            <RecentProductsSection />
          </LazySection>

          <LazySection minHeight={280} rootMargin="48px 0px" whenIdle>
            <HomeServicesSection />
          </LazySection>

          <LazySection minHeight={280} rootMargin="56px 0px" whenIdle>
            <FeaturedStoresSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="80px 0px" whenIdle>
            <PromotedProductsSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="80px 0px" whenIdle>
            <NearbyProvidersSection />
          </LazySection>
        </div>

        <div className="mx-auto mt-5 max-w-7xl space-y-3 px-3 sm:mt-10 sm:space-y-4 sm:px-4">
          <HomeAppPromo />
          <HomeSafeBuyingTips />
          <HomeBrowseLinks />
        </div>
      </HomeBusyBoundary>

      <HomeGuestPublishBar />
    </div>
  );
}
