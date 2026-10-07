'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useRecommendations } from '@/hooks/queries/useRecommendations';

export function RecommendedAds() {
  const { data, isLoading, isError, refetch } = useRecommendations();
  const items = data ?? [];

  if (isError) {
    return (
      <div className="flex justify-center py-6">
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <AdCardSkeleton key={i} />)}</div>;
  }

  if (items.length === 0) return null;

  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((ad) => <AdCard key={ad.id} ad={ad} />)}</div>;
}
