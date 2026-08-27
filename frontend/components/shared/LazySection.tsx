'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { isDataSaverEnabled } from '@/lib/dataSaver';

interface Props {
  children: ReactNode;
  /** How early to start loading before the section enters the viewport. */
  rootMargin?: string;
  minHeight?: number;
  fallback?: ReactNode;
  className?: string;
  /**
   * N3: after the section is near the viewport, wait for requestIdleCallback
   * (or a short timeout) before mounting children — reduces query fan-out on
   * weak CPUs / slow nets. Recommended for lowest-priority home blocks.
   */
  whenIdle?: boolean;
}

function defaultRootMargin(): string {
  // Data-saver / 2G: only load when truly near viewport (less prefetch).
  if (typeof window !== 'undefined' && isDataSaverEnabled()) {
    return '48px 0px';
  }
  return '240px 0px';
}

/** Defer mounting until near viewport — cuts home-page query fan-out. */
export function LazySection({
  children,
  rootMargin,
  minHeight = 240,
  fallback,
  className,
  whenIdle = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const margin = rootMargin ?? defaultRootMargin();

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, near]);

  useEffect(() => {
    if (!near || visible) return;
    if (!whenIdle) {
      setVisible(true);
      return;
    }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const mount = () => {
      if (!cancelled) setVisible(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(mount, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(mount, 400);
    }

    return () => {
      cancelled = true;
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [near, whenIdle, visible]);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={!visible ? { minHeight } : undefined}
      data-lazy={visible ? 'ready' : near ? 'idle' : 'pending'}
    >
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
