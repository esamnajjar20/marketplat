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
 * Homepage body (client tree).
 *
 * Phase 2 layout:
 * 1. Above-fold (carousel + categories + latest ads) — EagerHomeSections
 * 2. For you / trending
 * 3. Type rails (products → services → stores)
 * 4. Secondary (promoted + nearby) — loaded later
 * 5. Trust / promo footer links
 *
 * Spacing tightened on mobile to reduce scroll fatigue; bottom padding
 * clears the fixed BottomNav + optional guest publish bar.
 */
export function HomePageContent() {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-16 md:pb-16">
      <HomeBusyBoundary>
        {/* 1: carousel + categories + ads rail */}
        <EagerHomeSections />

        <div className="mt-5 space-y-7 sm:mt-8 sm:space-y-10">
          {/* 2: personalized / trending */}
          <LazySection minHeight={280} rootMargin="40px 0px" whenIdle>
            <ForYouMixedSection />
          </LazySection>

          {/* 3: primary type rails */}
          <LazySection minHeight={300} rootMargin="48px 0px" whenIdle>
            <RecentProductsSection />
          </LazySection>

          <LazySection minHeight={280} rootMargin="56px 0px" whenIdle>
            <HomeServicesSection />
          </LazySection>

          <LazySection minHeight={280} rootMargin="56px 0px" whenIdle>
            <FeaturedStoresSection />
          </LazySection>

          {/* 4: secondary rails — further down the fold */}
          <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
            <PromotedProductsSection />
          </LazySection>

          <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
            <NearbyProvidersSection />
          </LazySection>
        </div>

        <div className="mt-7 space-y-4 sm:mt-10">
          <HomeAppPromo />
          <HomeSafeBuyingTips />
          <HomeBrowseLinks />
        </div>
      </HomeBusyBoundary>

      <HomeGuestPublishBar />
    </div>
  );
}
