/**
 * Single entry point for opening a URL in a new browsing context.
 * Always passes `noopener,noreferrer` so the opened page can never reach
 * `window.opener`. Do not call `window.open(..., '_blank', ...)` directly.
 *
 * Returns the opened window, or `null` when the popup was blocked (or when
 * called outside the browser) so callers can fall back to a download.
 */
export function openExternal(url: string): Window | null {
  if (!url || typeof window === 'undefined') return null;
  return window.open(url, '_blank', 'noopener,noreferrer');
}
