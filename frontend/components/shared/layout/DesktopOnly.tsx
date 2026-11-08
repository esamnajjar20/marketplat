'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const media = window.matchMedia(DESKTOP_QUERY);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onStoreChange);
    return () => media.removeEventListener('change', onStoreChange);
  }

  // Safari versions predating MediaQueryList.addEventListener.
  media.addListener(onStoreChange);
  return () => media.removeListener(onStoreChange);
}

function getSnapshot(): boolean {
  // Older embedded webviews may not expose matchMedia. Preserve the previous
  // behavior there rather than permanently removing the desktop sidebar.
  return typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot(): boolean {
  // Match the first server/hydration render, then let useSyncExternalStore
  // reveal desktop-only children after the client knows the real breakpoint.
  return false;
}

/** Mount desktop-only content only when the corresponding CSS breakpoint is active. */
export function DesktopOnly({ children }: { children: ReactNode }) {
  const isDesktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isDesktop ? <>{children}</> : null;
}
