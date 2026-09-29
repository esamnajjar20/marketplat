'use client';

import { Clock } from 'lucide-react';
import { RecentAds }    from '@/components/home/RecentAds';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES }       from '@/lib/constants';

/**
 * "أحدث الإعلانات" — يبقى هنا سقف التحميل الخاص بالقسم،
 * بينما الفئات وFeaturedCarousel تُركّبان مباشرة في page.tsx.
 * يستخدم هذا القسم useAdsForHome مع مدينة التصفح عند توفرها،
 * ثم يعرض النتائج العامة عند عدم وجود مدينة.
 */

export function HomeAboveFold() {
  const { isChecking: recentChecking, isLoading: recentLoading, source: recentSource } = useAdsForHome();
  const { city } = useBrowseCity();

  const stillLoading = recentChecking || recentLoading;
  const badgeCity = recentSource === 'city' ? city : undefined;

  const latestAdsHeadingLoading = (
    <SectionHeader
      eyebrow="تصفّح"
      title="أحدث الإعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
    />
  );

  const latestAdsHeadingLoaded = (
    <SectionHeader
      eyebrow="تصفّح"
      title="أحدث الإعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
      badge={<LocationSourceBadge source={recentSource} city={badgeCity} requestedCity={city} quiet />}
    />
  );

  if (stillLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 px-3 pt-3 sm:px-4 sm:pt-6">
        {latestAdsHeadingLoading}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[min(72vw,280px)] shrink-0 sm:w-[240px]">
              <AdCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-3 px-3 pt-3 sm:px-4 sm:pt-6">
      {latestAdsHeadingLoaded}
      <RecentAds />
    </section>
  );
}
