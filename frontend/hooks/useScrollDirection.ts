'use client';

import { useEffect, useRef, useState } from 'react';

type ScrollDirection = 'up' | 'down';

/**
 * Tracks vertical scroll to drive chrome show/hide (e.g. BottomNav).
 * - direction "down" once past `topOffset` → consumer can hide UI
 * - direction "up" or near top → show
 * Ignores sub-threshold jitter and ignores scroll while sheets/drawers
 * may lock body (passive listener only).
 */
export function useScrollDirection(options?: {
  threshold?: number;
  topOffset?: number;
}): { direction: ScrollDirection; isNearTop: boolean; hidden: boolean } {
  const threshold = options?.threshold ?? 10;
  const topOffset = options?.topOffset ?? 48;
  const [direction, setDirection] = useState<ScrollDirection>('up');
  const [isNearTop, setIsNearTop] = useState(true);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    lastY.current = window.scrollY || 0;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const delta = y - lastY.current;
        setIsNearTop(y < topOffset);
        if (Math.abs(delta) >= threshold) {
          setDirection(delta > 0 ? 'down' : 'up');
          lastY.current = y;
        }
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset]);

  const hidden = direction === 'down' && !isNearTop;
  return { direction, isNearTop, hidden };
}
