'use client';

import { Clock } from 'lucide-react';
import { RecentAds } from '@/components/home/RecentAds';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';

/**
 * "أحدث الإعلانات" — sits below "مخصص لك" and products on the homepage.
 * CTA → /ads (not search).
 */
export function HomeAboveFold() {
  const { isChecking: recentChecking, isLoading: recentLoading, source: recentSource } = useAdsForHome();
  const { city } = useBrowseCity();

  const stillLoading = recentChecking || recentLoading;
  const badgeCity = recentSource === 'city' ? city : undefined;

  const heading = (
    <SectionHeader
      eyebrow="تصفّح"
      title="أحدث الإعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.ads, label: 'عرض الكل ←' }}
      badge={
        !stillLoading ? (
          <LocationSourceBadge source={recentSource} city={badgeCity} requestedCity={city} quiet />
        ) : undefined
      }
    />
  );

  if (stillLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 px-3 pt-1 sm:px-4">
        {heading}
        <HomeScrollRail>
          {Array.from({ length: 4 }).map((_, i) => (
            <HomeScrollRailItem key={i} size="wide">
              <AdCardSkeleton />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-3 px-3 pt-1 sm:px-4">
      {heading}
      <RecentAds />
    </section>
  );
}
