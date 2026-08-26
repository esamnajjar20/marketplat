'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  rootMargin?: string;
  minHeight?: number;
  fallback?: ReactNode;
  className?: string;
}

/** Defer mounting until near viewport — cuts home-page query fan-out. */
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
    <div ref={ref} className={cn(className)} style={!visible ? { minHeight } : undefined} data-lazy={visible ? 'ready' : 'pending'}>
      {visible ? children : (fallback ?? <DefaultFallback minHeight={minHeight} />)}
    </div>
  );
}

function DefaultFallback({ minHeight }: { minHeight: number }) {
  return (
    <div className="container mx-auto space-y-4 px-4 pt-10" style={{ minHeight }} aria-hidden>
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
