'use client';

/**
 * When search returns zero hits, show a small rail of recent active ads
 * so the user still has something to browse (not a dead end).
 */

import Link from 'next/link';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useAds } from '@/hooks/queries/useAds';
import { ROUTES } from '@/lib/constants';

export function EmptySearchAlternatives() {
  const { data, isLoading, isError } = useAds(
    { limit: 4, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: true },
  );

  const items = data?.items ?? [];
  if (isError || (!isLoading && items.length === 0)) return null;

  return (
    <div className="mt-8 space-y-3 border-t pt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">أحدث الإعلانات بدلاً من ذلك</h2>
        <Link href={`${ROUTES.search}?type=ads`} className="text-xs font-medium text-primary hover:underline">
        prefetch={false}
          عرض الكل
        </Link>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AdCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}
