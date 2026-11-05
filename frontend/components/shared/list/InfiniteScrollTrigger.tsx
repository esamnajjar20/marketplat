'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/shared/ui/Button';

import { Spinner } from '@/components/ui/spinner';
interface InfiniteScrollTriggerProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  endMessage?: string;
  loadingLabel?: string;
  /**
   * SCROLL-ERR-01: the last next-page fetch failed. Auto-loading pauses (no
   * retry loop against a struggling server) and an explicit retry button shows.
   */
  isError?: boolean;
}

/**
 * Shared infinite-list sentinel. It prefetches before the user reaches the
 * bottom, but keeps a real button as a keyboard/fallback path when observers
 * are unavailable or the user prefers explicit interaction.
 */
export function InfiniteScrollTrigger({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  endMessage = 'تم عرض كل النتائج',
  loadingLabel = 'جارٍ تحميل المزيد…',
  isError = false,
}: InfiniteScrollTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // SCROLL-ERR-01: callers often pass an inline arrow; keep the latest one in a
  // ref so the observer is not torn down and re-created (which re-fires its
  // initial callback) on every parent render.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage || isError || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current();
      },
      { rootMargin: '700px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError]);

  if (!hasNextPage) {
    return <p className="pt-2 text-center text-xs text-muted-foreground">{endMessage}</p>;
  }

  return (
    <div ref={sentinelRef} className="flex min-h-16 items-center justify-center pt-2" aria-live="polite">
      {isFetchingNextPage ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>{loadingLabel}</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground" role="alert">
          <span>تعذّر تحميل المزيد</span>
          <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
          تحميل المزيد
        </Button>
      )}
    </div>
  );
}
