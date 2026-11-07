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
