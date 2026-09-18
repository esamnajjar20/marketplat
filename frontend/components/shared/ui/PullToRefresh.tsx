'use client';

/**
 * PHASE-2 UX: lightweight pull-to-refresh for mobile list pages.
 * Does not fight native overscroll on iOS when pull distance is small.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
  className?: string;
  /** Min px of downward pull before release triggers refresh */
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  threshold = 64,
  disabled = false,
}: Props) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || refreshing) return;
      if (typeof window !== 'undefined' && window.scrollY > 4) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    },
    [disabled, refreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || disabled || refreshing) return;
      if (window.scrollY > 4) {
        pulling.current = false;
        setOffset(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;
      if (dy > 0) {
        setOffset(Math.min(dy * 0.45, threshold * 1.4));
      }
    },
    [disabled, refreshing, threshold],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    const should = offset >= threshold;
    setOffset(0);
    if (!should || disabled) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [offset, threshold, disabled, onRefresh]);

  return (
    <div
      className={cn('relative', className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: refreshing ? 40 : offset }}
        aria-hidden={!refreshing && offset < 8}
      >
        {(refreshing || offset > 12) && (
          <Loader2
            className={cn(
              'h-5 w-5 text-muted-foreground',
              refreshing && 'animate-spin',
              !refreshing && offset >= threshold && 'text-primary',
            )}
          />
        )}
      </div>
      {children}
    </div>
  );
}
