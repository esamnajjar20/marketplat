'use client';

import { Sparkle, AlertTriangle, MapPin } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { SectionHeader } from '@/components/home/SectionHeader';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

export function RecommendedAds() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(8, 4, dataSaver);
  const { city } = useBrowseCity();
  const { data, isLoading, isError, refetch } = useRecommendations({
    limit,
    city,
  });

  // Phase B: hide when fewer than 3 suggestions (avoids a sparse strip).
  if (!isLoading && !isError && (data?.length ?? 0) < 3) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
      <SectionHeader
        eyebrow="مخصص لك"
        title="قد يعجبك أيضاً"
        icon={<Sparkle className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.ads, label: 'المزيد' }}
        badge={
          city ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <MapPin className="h-3 w-3" aria-hidden />
              {city}
            </span>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: limit }).map((_, i) => (
            <AdCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-8 text-center text-sm">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-destructive">تعذّر تحميل الاقتراحات</p>
          <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger-fade-in">
          {data!.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </section>
  );
}
