'use client';

/**
 * When search returns zero hits, show a small rail of recent active ads
 * so the user still has something to browse (not a dead end).
 */

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
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
    <div className="mt-8 space-y-3 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-foreground">أحدث الإعلانات — جرّب هذه</h2>
        {/* SW-FIX-ESA-PREFETCH-MALFORM: historical malformed prefetch markup was
            corrected. This link now uses IntentPrefetchLink, so it warms only
            after user intent rather than on initial viewport entry. */}
        <IntentPrefetchLink
          prefetch={false}
          href={`${ROUTES.search}?type=ads`}
          clientQueryNavigation
          className="rounded-sm text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          عرض الكل
        </IntentPrefetchLink>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        لم نجد نتائج مطابقة — إليك أحدث ما نُشر على المنصة
      </p>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <AdCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map((ad) => (
            <AdCard key={ad.id} ad={ad} density="compact" />
          ))}
        </div>
      )}
    </div>
  );
}
