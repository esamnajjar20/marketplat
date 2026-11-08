/**
 * buildUrlWithParams — append query params to a URL that may ALREADY carry a
 * query string.
 *
 * Why this exists: some ROUTES entries are hub URLs with the tab baked in
 * (ROUTES.myAds === '/activity?tab=ads', ROUTES.myServiceRequests ===
 * '/activity?tab=requests'). Callers that did `${baseUrl}?${params}` produced
 * a second '?' ('/activity?tab=ads?tab=ads&status=SOLD'). The first `tab`
 * value then became 'ads?tab=ads', `resolveTab()` rejected it and silently fell
 * back to the timeline tab, and every further click nested the string deeper
 * (the URL grew on each navigation).
 *
 * Rules:
 *  - the query already present on `baseUrl` is kept (so `?tab=ads` survives
 *    even if `params` does not repeat it);
 *  - a key present in `params` replaces the base value for that key;
 *  - no trailing '?' when the final query is empty.
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */
export function buildUrlWithParams(baseUrl: string, params: URLSearchParams | string): string {
  const queryIndex = baseUrl.indexOf('?');
  const path = queryIndex === -1 ? baseUrl : baseUrl.slice(0, queryIndex);
  const merged = new URLSearchParams(queryIndex === -1 ? '' : baseUrl.slice(queryIndex + 1));
  const extra = typeof params === 'string' ? new URLSearchParams(params) : params;

  const overridden = new Set<string>();
  extra.forEach((_value, key) => overridden.add(key));
  overridden.forEach((key) => merged.delete(key));
  extra.forEach((value, key) => merged.append(key, value));

  const qs = merged.toString();
  return qs ? `${path}?${qs}` : path;
}


/**
 * Update query-string state for client-filtered lists without starting a new
 * App Router navigation/RSC request. Next.js 15 synchronizes native
 * pushState/replaceState calls with useSearchParams and usePathname.
 * Use only when the server route payload does not depend on the changed query.
 */
export function writeClientUrl(
  url: string,
  mode: 'push' | 'replace' = 'push',
): void {
  if (typeof window === 'undefined') return;

  try {
    const target = new URL(url, window.location.href);
    if (target.origin !== window.location.origin) return;
    const nextUrl = `${target.pathname}${target.search}${target.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) return;
    const method = mode === 'push' ? 'pushState' : 'replaceState';
    window.history[method](window.history.state, '', nextUrl);
  } catch {
    // Invalid URL state must not break list interactions.
  }
}
