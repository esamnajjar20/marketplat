'use client';

import { Layers } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useRelatedAds }  from '@/hooks/queries/useAds';

interface Props { adId: string; }

/**
 * UX phase-3: on mobile, related ads use a horizontal snap scroll so
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
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
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
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory sm:hidden [&::-webkit-scrollbar]:hidden">
        {data.map((ad) => (
          <div key={ad.id} className="w-[48%] min-w-[160px] max-w-[220px] shrink-0 snap-start">
            <AdCard ad={ad} context="related" />
          </div>
        ))}
      </div>
      {/* Tablet/desktop grid */}
      <div className="hidden grid-cols-2 gap-3 sm:grid sm:gap-4 stagger-fade-in">
        {data.map((ad) => <AdCard key={ad.id} ad={ad} context="related" />)}
      </div>
    </section>
  );
}
