'use client';

/**
 * NavigationProgress is retained as a compatibility component for any
 * existing imports, but route-level progress UI is intentionally disabled.
 * Keep signalNavigationStart below as a harmless compatibility event API.
 */
export function NavigationProgress() {
  return null;
}

export function signalNavigationStart(href: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('marketplace:nav-start', { detail: { href } }));
}
