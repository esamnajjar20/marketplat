'use client';

/**
 * UX: defer mounting below-the-fold home sections until the user
 * scrolls near them. Each discovery section owns its own React Query
 * hooks — mounting all of them on first paint fans out 4–6 parallel
 * requests and causes staggered layout jumps on slow networks.
 * Once visible once, stays mounted (no flicker on scroll-back).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** How early to start loading before the section enters the viewport. */
  rootMargin?: string;
  /** Placeholder height so the page scrollbar stays stable. */
  minHeight?: number;
  fallback?: ReactNode;
  className?: string;
}

export function LazySection({
  children,
  rootMargin = '240px 0px',
  minHeight = 240,
  fallback,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    // Environments without IntersectionObserver (very old WebViews)
    // just mount immediately — never block content.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={!visible ? { minHeight } : undefined}
      // Landmark for screen readers once content arrives
      data-lazy={visible ? 'ready' : 'pending'}
    >
      {visible ? children : (fallback ?? <DefaultSectionFallback minHeight={minHeight} />)}
    </div>
  );
}

function DefaultSectionFallback({ minHeight }: { minHeight: number }) {
  return (
    <div
      className="container mx-auto space-y-4 px-4 pt-10"
      style={{ minHeight }}
      aria-hidden
    >
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
