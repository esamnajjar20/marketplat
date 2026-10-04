'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/shared/ui/Button';

interface InfiniteScrollTriggerProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  endMessage?: string;
  loadingLabel?: string;
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
}: InfiniteScrollTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '700px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (!hasNextPage) {
    return <p className="pt-2 text-center text-xs text-muted-foreground">{endMessage}</p>;
  }

  return (
    <div ref={sentinelRef} className="flex min-h-16 items-center justify-center pt-2" aria-live="polite">
      {isFetchingNextPage ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>{loadingLabel}</span>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
          تحميل المزيد
        </Button>
      )}
    </div>
  );
}
