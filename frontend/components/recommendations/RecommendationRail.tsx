'use client';

import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props<T> {
  title: string;
  icon: ReactNode;
  items: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  getItemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderSkeleton: () => ReactNode;
  /** Grid column layout differs per entity (StoreCard is a horizontal
   * row layout, unlike ProductCard/ServiceListingCard's square/4:3
   * image cards) — see ProductRecommendations/ServiceRecommendations
   * vs StoreRecommendations for the two shapes this app already uses
   * elsewhere (RecommendedAds/RecentStores). */
  gridClassName?: string;
  skeletonCount?: number;
  className?: string;
}

const DEFAULT_GRID = 'grid-cols-2 lg:grid-cols-4 gap-3';

/**
 * Shared rail architecture behind ProductRecommendations/
 * ServiceRecommendations/StoreRecommendations (PR4C) — one
 * loading/empty/error/success implementation instead of three
 * duplicated ones. Mirrors RecommendedAds.tsx/RelatedAds.tsx's own
 * pattern exactly (same self-contained "the whole section disappears,
 * heading included, when there's genuinely nothing to show" rule, and
 * the same posture: an error surfaces a small inline
 * retry instead of silently collapsing to nothing the way a genuinely
 * empty result does) — generalized here so a fourth/fifth entity type
 * never needs a fourth/fifth copy of this logic.
 */
export function RecommendationRail<T>({
  title,
  icon,
  items,
  isLoading,
  isError,
  refetch,
  getItemKey,
  renderItem,
  renderSkeleton,
  gridClassName = DEFAULT_GRID,
  skeletonCount = 8,
  className,
}: Props<T>) {
  if (!isLoading && !isError && !items?.length) return null;

  return (
    <section className={cn('space-y-4 border-t pt-8', className)}>
      <h2 className="flex items-center gap-1.5 text-lg font-bold">
        {icon}
        {title}
      </h2>

      {isLoading ? (
        <div className={cn('grid', gridClassName)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i}>{renderSkeleton()}</div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل التوصيات</p>
          <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className={cn('grid stagger-fade-in', gridClassName)}>
          {items!.map((item) => (
            <div key={getItemKey(item)}>{renderItem(item)}</div>
          ))}
        </div>
      )}
    </section>
  );
}
