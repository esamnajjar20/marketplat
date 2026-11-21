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
 * PERF-LOAD-01: warm the next dynamic chunks during browser idle so scrolling
 * into lower rails does not wait on network+parse of JS. Safe: imports are
 * cached by the bundler; no extra API calls.
 */
function useWarmHomeChunks(isAuthenticated: boolean, isNative: boolean) {
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const warm = () => {
      if (cancelled) return;
      // Fire-and-forget; webpack/turbopack cache the modules.
      void import('@/components/home/ForYouMixedSection');
      void import('@/components/home/HomeAboveFold');
      void import('@/components/home/RecentProductsSection');
      if (isAuthenticated) void import('@/components/home/FollowingFeedSection');
      // Defer lowest-priority chunks a bit more to keep the first idle slot free.
      const later = () => {
        if (cancelled) return;
        void import('@/components/home/HomeServicesSection');
        void import('@/components/home/FeaturedStoresSection');
        if (!isNative) void import('@/components/home/NearbyProvidersSection');
        if (!isNative) void import('@/components/home/HomeAppPromo');
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(later, { timeout: 4000 });
      } else {
        setTimeout(later, 1500);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(warm, { timeout: 1800 });
    } else {
      timeoutId = setTimeout(warm, 600);
    }

    return () => {
      cancelled = true;
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAuthenticated, isNative]);
}

/**
 * Homepage — Phase 2 native chrome + Phase 3 pull-to-refresh.
 *
 * HYDRATION-SAFE:
 *   During SSR and the very first client render, `mounted` is false and
 *   PullToRefresh is NOT rendered. This guarantees the tree matches the
 *   server byte-for-byte, eliminating React #418. `useEffect` runs only
 *   AFTER hydration completes, so swapping in PullToRefresh + respecting
 *   the real `isNative` value happens safely outside hydration.
 *
 * PERF-LOAD-01 (2026-11-21):
 *   - priority LazySections for ForYou / Following (earlier rootMargin, no idle)
 *   - lower rails use whenIdle with faster timeouts
 *   - idle-time warming of dynamic JS chunks after first paint
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

  useWarmHomeChunks(Boolean(isAuthenticated), Boolean(isNative));

  const onRefresh = useCallback(async () => {
    await feed.refetch();
  }, [feed]);

  /**
   * Spacing: tighter on mobile to reduce "endless scroll" feel.
   * Loading order: priority rails first, then whenIdle for the rest.
   */
  const content = (
    <div className="pb-0 md:pb-16">
      <HomeBusyBoundary>
        <EagerHomeSections />
        <div className="mx-auto mt-2.5 max-w-7xl px-3 sm:mt-4 sm:px-4">
          <StoriesRail />
        </div>

        <div className="mt-2.5 space-y-3.5 sm:mt-5 sm:space-y-6">
          {/* Priority: first discovery rails — mount ASAP near viewport */}
          <LazySection minHeight={240} priority>
            <HomeSectionBoundary>
              <ForYouMixedSection />
            </HomeSectionBoundary>
          </LazySection>
          {isAuthenticated && (
            <LazySection minHeight={220} priority>
              <HomeSectionBoundary>
                <FollowingFeedSection />
              </HomeSectionBoundary>
            </LazySection>
          )}
          {/* Secondary: idle-friendly to protect main thread */}
          <LazySection minHeight={240} whenIdle rootMargin="120px 0px">
            <HomeSectionBoundary>
              <HomeAboveFold />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} whenIdle rootMargin="140px 0px">
            <HomeSectionBoundary>
              <RecentProductsSection />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} whenIdle rootMargin="160px 0px">
            <HomeSectionBoundary>
              <HomeServicesSection />
            </HomeSectionBoundary>
          </LazySection>
          <LazySection minHeight={240} whenIdle rootMargin="180px 0px">
            <HomeSectionBoundary>
              <FeaturedStoresSection />
            </HomeSectionBoundary>
          </LazySection>
          {!isNative && (
            <LazySection minHeight={220} whenIdle rootMargin="220px 0px">
              <HomeSectionBoundary>
                <NearbyProvidersSection />
              </HomeSectionBoundary>
            </LazySection>
          )}
        </div>

        {!isNative && (
          <div className="mx-auto mt-4 max-w-7xl space-y-3 px-3 sm:mt-10 sm:space-y-4 sm:px-4">
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
