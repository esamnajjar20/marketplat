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
  const contentRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  // Set once the mounted children render nothing (e.g. a section that
  // self-hides when it has no data). Without it the reserved minHeight stays
  // forever and leaves a blank gap in the page.
  const [collapsed, setCollapsed] = useState(false);
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

  // After mount, watch the children's own box. minHeight is kept while they
  // render content (CLS), and released only when they render nothing at all.
  useEffect(() => {
    if (!visible) return;
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const sync = () => setCollapsed(node.offsetHeight === 0);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={cn(className)}
      // Phase D: keep minHeight after mount so a short section does not
      // collapse the reserved slot and shift the rest of the page (CLS) —
      // unless the section rendered nothing (see `collapsed`).
      style={{ minHeight: collapsed ? 0 : minHeight }}
      data-lazy={visible ? 'ready' : near ? 'idle' : 'pending'}
      aria-busy={!visible}
    >
      {visible ? (
        <div ref={contentRef}>{children}</div>
      ) : (
        (fallback ?? <DefaultFallback minHeight={minHeight} />)
      )}
    </div>
  );
}

/** Phase D: fixed-height skeleton matching a typical home discovery row. */
function DefaultFallback({ minHeight }: { minHeight: number }) {
  return (
    <div
      className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3"
      style={{ minHeight }}
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] w-40 shrink-0 animate-pulse rounded-xl bg-muted sm:w-auto"
          />
        ))}
      </div>
    </div>
  );
}
