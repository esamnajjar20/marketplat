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

/** Convert a live URL query string into the serializable shape used by browse grids.
 * Repeated keys are retained as arrays so URL state survives client-only changes.
 */
export function parseBrowseSearchParams(queryString: string): BrowseSearchParams {
  const result: BrowseSearchParams = {};
  const params = new URLSearchParams(queryString);
  params.forEach((value, key) => {
    const current = result[key];
    if (current === undefined) result[key] = value;
    else if (Array.isArray(current)) result[key] = [...current, value];
    else result[key] = [current, value];
  });
  return result;
}

/** Stable comparison key for server-seeded params vs the live address bar.
 * Key ordering is normalized; duplicate values retain their original order.
 */
export function canonicalBrowseSearchParams(
  params: BrowseSearchParams | URLSearchParams,
): string {
  const entries: Array<[string, string, number]> = [];
  if (params instanceof URLSearchParams) {
    let index = 0;
    params.forEach((value, key) => entries.push([key, value, index++]));
  } else {
    let index = 0;
    for (const [key, raw] of Object.entries(params)) {
      if (raw === undefined) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) entries.push([key, value, index++]);
    }
  }
  entries.sort(([keyA, valueA, orderA], [keyB, valueB, orderB]) =>
    keyA.localeCompare(keyB) || orderA - orderB || valueA.localeCompare(valueB),
  );
  const normalized = new URLSearchParams();
  for (const [key, value] of entries) normalized.append(key, value);
  return normalized.toString();
}
