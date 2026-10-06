'use client';

/**
 * SLOW-NET non-critical font weights after first paint / idle.
 * Critical path keeps Cairo 400+600 and IBM Plex Sans 400 only.
 */
import { useEffect } from 'react';

export function DeferredFonts() {
  useEffect(() => {
    const load = () => {
      void import('@fontsource/cairo/500.css');
      void import('@fontsource/cairo/700.css');
      void import('@fontsource/ibm-plex-sans-arabic/500.css');
      void import('@fontsource/ibm-plex-mono/500.css');
      void import('@fontsource/ibm-plex-mono/600.css');
    };
    const w = globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(load, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = globalThis.setTimeout(load, 1200);
    return () => globalThis.clearTimeout(t);
  }, []);
  return null;
}
