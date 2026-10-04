'use client';

import { useScrollDirection } from './useScrollDirection';

/**
 * Mirrors BottomNav's hide/show behavior for sticky CTAs.
 * BottomNav hides when scroll direction is "down" past `topOffset`.
 * This hook uses the same scroll signal so every sticky bar moves
 * together — no more CTA pinned at the bottom while the nav is gone.
 *
 * Returns the classNames to apply to the sticky element:
 *   'translate-y-[calc(100%+2.5rem)] pointer-events-none'  (hidden)
 *   'translate-y-0'                                        (visible)
 * plus the shared transition tokens used by BottomNav.
 */
export function useStickyCtaVisible() {
  const { hidden } = useScrollDirection();
  return {
    hidden,
    transitionClass:
      'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] will-change-transform',
    hiddenClass: hidden
      ? 'translate-y-[calc(100%+2.5rem)] pointer-events-none'
      : 'translate-y-0',
  };
}
