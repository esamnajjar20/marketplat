'use client';

import Link from 'next/link';
import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { Button }         from '@/components/shared/ui/Button';
import { useAds }         from '@/hooks/queries/useAds';
import { ROUTES }         from '@/lib/constants';

export function RecentAds() {
  const { data, isLoading } = useAds({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.search}>
          <Button variant="outline">عرض جميع الإعلانات</Button>
        </Link>
      </div>
    </div>
  );
}
