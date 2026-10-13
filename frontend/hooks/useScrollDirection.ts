'use client';

import { useEffect, useRef, useState } from 'react';

type ScrollDirection = 'up' | 'down';

/**
 * Stable scroll-direction signal for mobile chrome. Small scroll jitter is
 * accumulated instead of toggling the UI; chrome stays visible near the top,
 * only hides after a deliberate downward scroll, and returns on a deliberate
 * upward scroll. Optional hideAfter lets bottom navigation use a safer
 * threshold without changing the default used by sticky CTAs.
 */
export function useScrollDirection(options?: {
  threshold?: number;
  topOffset?: number;
  hideAfter?: number;
}): { direction: ScrollDirection; isNearTop: boolean; hidden: boolean } {
  const threshold = options?.threshold ?? 10;
  const topOffset = options?.topOffset ?? 48;
  const hideAfter = options?.hideAfter ?? 0;
  const [direction, setDirection] = useState<ScrollDirection>('up');
  const [isNearTop, setIsNearTop] = useState(true);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    lastY.current = Math.max(0, window.scrollY || 0);

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY || 0);
        const delta = y - lastY.current;
        const nearTop = y < topOffset;
        setIsNearTop(nearTop);

        // At the top the navigation is always available. Otherwise ignore
        // tiny deltas to prevent flicker from touchpad/touch-scroll jitter.
        if (nearTop) {
          setDirection('up');
          lastY.current = y;
        } else if (Math.abs(delta) >= threshold) {
          if (delta > 0) {
            // Optional hide threshold prevents hiding after a tiny nudge.
            if (y >= hideAfter) setDirection('down');
          } else {
            setDirection('up');
          }
          lastY.current = y;
        }
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset, hideAfter]);

  const hidden = direction === 'down' && !isNearTop;
  return { direction, isNearTop, hidden };
}
