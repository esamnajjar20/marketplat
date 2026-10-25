'use client';

import { Layers } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useRelatedAds }  from '@/hooks/queries/useAds';

interface Props { adId: string; }

/**
 * UX on mobile, related ads use a horizontal snap scroll so
 * the section stays compact below the sticky contact bar; desktop keeps
 * the 4-column grid.
 */
export function RelatedAds({ adId }: Props) {
  const { data, isLoading } = useRelatedAds(adId);

  if (isLoading) {
    return (
      <section className="space-y-4 border-t pt-8" aria-busy="true">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          إعلانات مشابهة
        </h2>
        {/* Match the real section: horizontal cards on phones, responsive grid on larger screens. */}
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-2 sm:hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-[48%] min-w-[160px] max-w-[220px] shrink-0">
              <AdCardSkeleton density="compact" />
            </div>
          ))}
        </div>
        <div className="hidden min-w-0 grid-cols-2 gap-3 sm:grid sm:gap-4 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => <AdCardSkeleton key={i} />)}
        </div>
      </section>
    );
  }

  if (!data?.length) return null;

  return (
    <section className="space-y-4 border-t pt-8 pb-28 lg:pb-4">
      <h2 className="flex items-center gap-1.5 text-lg font-bold">
        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
        إعلانات مشابهة
      </h2>
      {/* Mobile: horizontal snap carousel */}
      <div className="-mx-4 flex gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 snap-x snap-mandatory sm:hidden [&::-webkit-scrollbar]:hidden">
        {data.map((ad) => (
          <div key={ad.id} className="w-[48%] min-w-[160px] max-w-[220px] shrink-0 snap-start">
            <AdCard ad={ad} context="related" />
          </div>
        ))}
      </div>
      {/* Tablet/desktop grid: progressively use available width without shrinking cards excessively. */}
      <div className="hidden min-w-0 grid-cols-2 gap-3 sm:grid sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 stagger-fade-in">
        {data.map((ad) => <AdCard key={ad.id} ad={ad} context="related" />)}
      </div>
    </section>
  );
}
