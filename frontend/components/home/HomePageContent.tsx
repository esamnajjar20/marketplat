'use client';

import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { HomeAppPromo } from '@/components/home/HomeAppPromo';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { FollowingFeedSection } from '@/components/home/FollowingFeedSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { HomeBusyBoundary } from '@/components/home/HomeBusyBoundary';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { LazySection } from '@/components/shared/LazySection';

/**
 * Homepage content hierarchy:
 * discovery → categories → featured → mixed recommendations → following → entity feeds.
 * Quick navigation appears before the large promotional carousel; useful mixed
 * discovery precedes the following feed's empty state for newer accounts.
 * No repeated publish/explore/browse blocks; every entity gets one primary rail.
 */
export function HomePageContent() {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-16 md:pb-16">
      <HomeBusyBoundary>
        <EagerHomeSections />
        <div className="mx-auto mt-3 max-w-7xl px-3 sm:mt-4 sm:px-4"><StoriesRail /></div>

        <div className="mt-3 space-y-4 sm:mt-5 sm:space-y-6">
          <LazySection minHeight={240} rootMargin="20px 0px" whenIdle={false}>
            <ForYouMixedSection />
          </LazySection>
          <LazySection minHeight={220} rootMargin="32px 0px" whenIdle={false}>
            <FollowingFeedSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="40px 0px" whenIdle>
            <HomeAboveFold />
          </LazySection>

          <LazySection minHeight={240} rootMargin="48px 0px" whenIdle>
            <RecentProductsSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="56px 0px" whenIdle>
            <HomeServicesSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="64px 0px" whenIdle>
            <FeaturedStoresSection />
          </LazySection>

          <LazySection minHeight={220} rootMargin="72px 0px" whenIdle>
            <NearbyProvidersSection />
          </LazySection>
        </div>

        <div className="mx-auto mt-5 max-w-7xl space-y-3 px-3 sm:mt-10 sm:space-y-4 sm:px-4">
          <HomeAppPromo />
        </div>
      </HomeBusyBoundary>
    </div>
  );
}
