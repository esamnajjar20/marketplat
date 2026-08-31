'use client';

import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { useAds } from '@/hooks/queries/useAds';

const DISPLAY_COUNT = 4;

/**
 * إعلانات مميزة — إن لم يوجد مميز يُعرض أحدث الإعلانات كبديل
 * بدل إخفاء القسم بالكامل (فراغ بصري فوق الطية).
 */
export function FeaturedAds() {
  const {
    data: featuredData,
    isLoading: featuredLoading,
    isError: featuredError,
    error: featuredErr,
    refetch: refetchFeatured,
  } = useAds({ isFeatured: true, limit: DISPLAY_COUNT });

  const featuredItems = featuredData?.items ?? [];
  const useFallback =
    !featuredLoading && !featuredError && featuredItems.length === 0;

  const {
    data: fallbackData,
    isLoading: fallbackLoading,
    isError: fallbackError,
    error: fallbackErr,
    refetch: refetchFallback,
  } = useAds(
    { limit: DISPLAY_COUNT, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: useFallback },
  );

  const isLoading = featuredLoading || (useFallback && fallbackLoading);
  const isError = useFallback ? fallbackError : featuredError;
  const error = useFallback ? fallbackErr : featuredErr;
  const refetch = useFallback ? refetchFallback : refetchFeatured;
  const items = useFallback ? (fallbackData?.items ?? []) : featuredItems;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: DISPLAY_COUNT }).map((_, i) => (
          <AdCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ApiError error={error} onRetry={refetch} variant="inline" />;
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {useFallback && (
        <p className="text-xs text-muted-foreground">
          لا إعلانات مميزة حاليًا — نعرض أحدث المنشورات بدلًا منها.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 stagger-fade-in md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {items.map((ad, i) => (
          <AdCard key={ad.id} ad={ad} priority={i < 2} />
        ))}
      </div>
    </div>
  );
}
