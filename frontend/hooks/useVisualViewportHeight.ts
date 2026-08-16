import { useEffect, useState } from 'react';

/**
 * FIX UX-KEYBOARD-01: fixed-position bottom sheets (Sheet.tsx) were
 * sized with `max-h-[85vh]`, a static viewport-height percentage. On
 * mobile, opening the on-screen keyboard (e.g. focusing the search
 * input inside StoresFilters, which sits as the very first field in
 * every filter sheet) does not shrink the layout viewport `vh` is
 * based on in most Android/Chrome versions — this codebase also has
 * no `dvh` usage anywhere (verified: zero matches for dvh/visualViewport
 * before this fix). So the sheet kept reporting its pre-keyboard
 * height and could render with its content, including the just-focused
 * input, partially hidden behind the keyboard instead of shrinking to
 * fit above it.
 *
 * `window.visualViewport` is the correct, broadly-supported (iOS
 * Safari 13+, Chrome 61+) API for the actual visible area once a
 * keyboard is on screen — its `height` shrinks live as the keyboard
 * opens/closes, unlike `window.innerHeight` or any CSS vh unit.
 *
 * Returns null during SSR / before the API is available, so callers
 * should fall back to a static Tailwind class (e.g. max-h-[85vh]) in
 * that case — see Sheet.tsx.
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setHeight(window.visualViewport!.height);
    }

    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return height;
}
