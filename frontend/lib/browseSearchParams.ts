/** Match the deterministic initial NetworkPolicy used for SSR/hydration
 * (base page size 12 × initial multiplier 0.8). Keep this fixed for a
 * server-seeded infinite query so page offsets never change mid-list.
 */
export const SSR_BROWSE_PAGE_SIZE = 10;

/**
 * Next's server Data Cache may return a response cached up to this long ago.
 * Pass a conservative timestamp to TanStack Query so it does not treat that
 * cached response as freshly fetched at the time of the current request.
 */
export const SSR_BROWSE_REVALIDATE_SECONDS = 60;
export const SSR_BROWSE_MAX_CACHE_AGE_MS = SSR_BROWSE_REVALIDATE_SECONDS * 1_000;

/** URL searchParams shape returned by the Next.js App Router. */
export type BrowseSearchParams = Record<string, string | string[] | undefined>;

export function getBrowseParam(
  params: BrowseSearchParams,
  key: string,
): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}

export function getBrowseNumber(
  params: BrowseSearchParams,
  key: string,
): number | undefined {
  const value = getBrowseParam(params, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Serialize the current route query for URL-backed client controls without
 * making result grids call useSearchParams during their server render.
 */
export function serializeBrowseSearchParams(params: BrowseSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.set(key, value);
    }
  }
  return query.toString();
}
