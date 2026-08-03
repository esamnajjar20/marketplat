'use client';

import { Layers } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useRelatedAds }  from '@/hooks/queries/useAds';

interface Props { adId: string; }

export function RelatedAds({ adId }: Props) {
  const { data, isLoading } = useRelatedAds(adId);

  if (isLoading) {
    return (
      <section className="space-y-4 border-t pt-8">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Layers className="h-4 w-4 text-muted-foreground" />
          إعلانات مشابهة
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <AdCardSkeleton key={i} />)}
        </div>
      </section>
    );
  }

  if (!data?.length) return null;

  return (
    <section className="space-y-4 border-t pt-8">
      <h2 className="flex items-center gap-1.5 text-lg font-bold">
        <Layers className="h-4 w-4 text-muted-foreground" />
        إعلانات مشابهة
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
    </section>
  );
}
