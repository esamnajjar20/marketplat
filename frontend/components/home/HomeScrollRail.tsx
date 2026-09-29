'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Horizontal browse strip used by type sections on the homepage.
 * Cards stay a fixed min-width so the user can swipe sideways; on md+ screens
 * (no touch swipe, hidden scrollbar) prev/next arrows appear when the strip
 * overflows. Arrows are RTL-aware: in RTL, scrollLeft is 0 at the start and
 * goes negative as the user scrolls on.
 */
export function HomeScrollRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /** Applied to each direct child wrapper if you pass raw nodes via map outside */
  itemClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setCanPrev(pos > 4);
    setCanNext(max > 4 && pos < max - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(el);
    }
    // Adding/removing cards changes scrollWidth without resizing the strip
    // itself, so watch its children instead of depending on `children`
    // (which re-bound every listener on each render).
    let mutationObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(update);
      mutationObserver.observe(el, { childList: true });
    }
    return () => {
      el.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [update]);

  const scrollByPage = (direction: 'prev' | 'next') => {
    const el = ref.current;
    if (!el) return;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    // "next" moves toward the end of the content: left in RTL, right in LTR.
    const sign = (direction === 'next' ? 1 : -1) * (isRtl ? -1 : 1);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: sign * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  const arrowClass =
    'absolute top-1/3 z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-sm backdrop-blur transition-opacity hover:bg-background md:flex';

  return (
    <div className="relative">
      <div
        ref={ref}
        className={cn(
          '-mx-4 flex gap-3 overflow-x-auto overscroll-x-contain touch-pan-x px-4 pb-1 snap-x snap-mandatory',
          '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
          className,
        )}
      >
        {children}
      </div>
      {canPrev ? (
        <button
          type="button"
          aria-label="السابق"
          onClick={() => scrollByPage('prev')}
          className={cn(arrowClass, 'start-1')}
        >
          <ChevronRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          aria-label="التالي"
          onClick={() => scrollByPage('next')}
          className={cn(arrowClass, 'end-1')}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function HomeScrollRailItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-[min(68vw,280px)] shrink-0 snap-start sm:w-[240px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
