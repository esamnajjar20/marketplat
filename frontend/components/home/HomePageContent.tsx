'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { HomeBusyBoundary } from '@/components/home/HomeBusyBoundary';
import { StoriesRail } from '@/components/stories/StoriesRail';
import { LazySection } from '@/components/shared/LazySection';
import { HomeSectionFallback } from '@/components/home/HomeSectionFallback';
import { HomeSectionBoundary } from '@/components/home/HomeSectionBoundary';
import { PullToRefresh } from '@/components/shared/ui/PullToRefresh';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

// HOME-FLICKER-01: while a lazy section's JS chunk loads, show the same skeleton
// LazySection already showed (no blank frame between skeleton and content).
const sectionLoading = () => <HomeSectionFallback minHeight={240} />;

const HomeAppPromo = dynamic(() =>
  import('@/components/home/HomeAppPromo').then((module) => module.HomeAppPromo),
);
const ForYouMixedSection = dynamic(() =>
  import('@/components/home/ForYouMixedSection').then((module) => module.ForYouMixedSection),
  { loading: sectionLoading },
);
const FollowingFeedSection = dynamic(() =>
  import('@/components/home/FollowingFeedSection').then((module) => module.FollowingFeedSection),
  { loading: sectionLoading },
);
const HomeAboveFold = dynamic(() =>
  import('@/components/home/HomeAboveFold').then((module) => module.HomeAboveFold),
  { loading: sectionLoading },
);
const RecentProductsSection = dynamic(() =>
  import('@/components/home/RecentProductsSection').then(
    (module) => module.RecentProductsSection,
  ),
  { loading: sectionLoading },
);
const HomeServicesSection = dynamic(() =>
  import('@/components/home/HomeServicesSection').then((module) => module.HomeServicesSection),
  { loading: sectionLoading },
);
const FeaturedStoresSection = dynamic(() =>
  import('@/components/home/FeaturedStoresSection').then(
    (module) => module.FeaturedStoresSection,
  ),
  { loading: sectionLoading },
);
const NearbyProvidersSection = dynamic(() =>
  import('@/components/home/NearbyProvidersSection').then(
    (module) => module.NearbyProvidersSection,
  ),
  { loading: sectionLoading },
);

/**
 * Homepage — Phase 2 native chrome + Phase 3 pull-to-refresh.
 *
 * HYDRATION-SAFE:
 *   During SSR and the very first client render, `mounted` is false and
 *   PullToRefresh is NOT rendered. This guarantees the tree matches the
 *   server byte-for-byte, eliminating React #418. `useEffect` runs only
 *   AFTER hydration completes, so swapping in PullToRefresh + respecting
 *   the real `isNative` value happens safely outside hydration.
 */
export function HomePageContent() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const _isNative = useIsNativeApp();
  const isNative = mounted && _isNative;
  const feed = useHomeFeed();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const onRefresh = useCallback(async () => {
    await feed.refetch();
  }, [feed]);

  const content = (
    <div className="pb-0 md:pb-16">
      <HomeBusyBoundary>
        <EagerHomeSections />
        <div className="mx-auto mt-3 max-w-7xl px-3 sm:mt-4 sm:px-4">
          <StoriesRail />
        </div>

        <div className="mt-3 space-y-4 sm:mt-5 sm:space-y-6">
          <LazySection minHeight={240} rootMargin="20px 0px" whenIdle={false}>
            <HomeSectionBoundary>
              <ForYouMixedSection />
            </HomeSectionBoundary>
          </LazySection>
          {isAuthenticated && (
            <LazySection minHeight={220} rootMargin="32px 0px" whenIdle={false}>
              <HomeSectionBoundary>
                <FollowingFeedSection />
              </HomeSectionBoundary>
            </LazySection>
          )}
          <LazySection minHeight={240} rootMargin="40px 0px" whenIdle>
            <HomeSectionBoundary>
              <HomeAboveFold />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} rootMargin="48px 0px" whenIdle>
            <HomeSectionBoundary>
              <RecentProductsSection />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} rootMargin="56px 0px" whenIdle>
            <HomeSectionBoundary>
              <HomeServicesSection />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} rootMargin="64px 0px" whenIdle>
            <HomeSectionBoundary>
              <FeaturedStoresSection />
            </HomeSectionBoundary>
          </LazySection>
          {!isNative && (
            <LazySection minHeight={220} rootMargin="72px 0px" whenIdle>
              <HomeSectionBoundary>
                <NearbyProvidersSection />
              </HomeSectionBoundary>
            </LazySection>
          )}
        </div>

        {!isNative && (
          <div className="mx-auto mt-5 max-w-7xl space-y-3 px-3 sm:mt-10 sm:space-y-4 sm:px-4">
            <HomeSectionBoundary>
              <HomeAppPromo />
            </HomeSectionBoundary>
          </div>
        )}
      </HomeBusyBoundary>
    </div>
  );

  // SSR + first client render → identical tree (no PullToRefresh wrapper).
  if (!mounted || !isNative) return content;

  return (
    <PullToRefresh onRefresh={onRefresh} className="native-home-root">
      {content}
    </PullToRefresh>
  );
}
