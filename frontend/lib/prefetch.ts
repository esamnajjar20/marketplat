/**
 * Server-side prefetch helpers for Next.js Server Components.
 *
 * Used in page.tsx files to warm the TanStack Query cache before
 * the page streams to the client, eliminating the loading flash for
 * critical data.
 *
 * Pattern:
 *   1. Call getQueryClient() on the server.
 *   2. Await prefetchQuery() / prefetchInfiniteQuery().
 *   3. Dehydrate the cache and pass to <HydrationBoundary>.
 *
 * Reference: https://tanstack.com/query/latest/docs/framework/react/nextjs/server-rendering-prefetching
 *
 * FIX API-SHAPE-01: every prefetch function below used to store the
 * FULL ApiResponse envelope ({ success, message, data, meta }) in the
 * query cache under the same queryKey the matching client hook
 * (useCategories, useAds, useAd — all via `.then(r => r.data.data)`)
 * reads from. On hydration, the client hook would then read the
 * cached envelope as if it were already the unwrapped payload,
 * handing components either the wrong shape entirely (categories.map
 * is not a function — the envelope isn't an array) or, for the
 * paginated ad list, an object with no `.items`/`.meta` at all (the
 * backend puts a list's items directly on `data` and pagination under
 * the top-level `meta.pagination` — see lib/apiPagination.ts for the
 * full story). Each queryFn below now resolves to exactly what its
 * client-side counterpart's `.then(r => r.data.data)` would produce,
 * so hydration hands off a value of the same shape either way.
 */
import { dehydrate, type QueryClient } from '@tanstack/react-query';
import { cache }        from 'react';
import { queryKeys }    from './queryKeys';
import { API_BASE_URL } from './constants';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { Category }    from '@/types/category.types';
import type { AdListItem, Ad } from '@/types/ad.types';

// ── Raw fetch (no Axios — server context) ─────────────────────────

/**
 * API-INT-09 FIX: serverFetch improvements:
 *  1. Error message no longer leaks the internal API path — logs it server-side
 *     but throws a generic message that could surface to the client.
 *  2. Guards response body parsing: attempts JSON, falls back gracefully.
 *  3. Propagates HTTP status so callers can distinguish 404 vs 500.
 */
async function serverFetch<T>(path: string): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      next: { revalidate: 60 },
    });
  } catch (networkErr) {
    // Network-level failure (DNS, refused connection, etc.)
    console.error(`[serverFetch] Network error for ${path}:`, networkErr);
    throw new Error('فشل الاتصال بالخادم');
  }

  if (!res.ok) {
    // Log path server-side only — do NOT include in the thrown Error
    // because Next.js may surface thrown messages in RSC error boundaries.
    console.error(`[serverFetch] HTTP ${res.status} for ${path}`);
    throw new Error(`طلب الخادم فشل (${res.status})`);
  }

  try {
    return (await res.json()) as ApiResponse<T>;
  } catch (parseErr) {
    console.error(`[serverFetch] JSON parse error for ${path}:`, parseErr);
    throw new Error('استجابة الخادم غير صالحة');
  }
}

// ── Prefetch functions ────────────────────────────────────────────

/**
 * Prefetch the categories list.
 * Used in the homepage and search page server components.
 *
 * FIX API-SHAPE-01: GET /categories is not paginated — `data` is a
 * flat Category[] already. Resolving the prefetch to `.data` (not the
 * whole envelope) matches useCategories()'s `.then(r => r.data.data)`.
 */
export async function prefetchCategories(qc: QueryClient): Promise<void> {
  await qc.prefetchQuery({
    queryKey: queryKeys.categories.all(),
    queryFn:  () => serverFetch<Category[]>('/categories').then((r) => r.data ?? []),
    staleTime: 60 * 60 * 1000, // 1 hour — matches CACHE_TTL.categories
  });
}

/**
 * Prefetch the active ad list for a given search.
 * Used in category pages and search results.
 *
 * FIX API-SHAPE-01: GET /ads puts the ad array directly on `data` and
 * pagination info under the top-level `meta.pagination` (not
 * `data.meta`) — reassembled here into the { items, meta } shape
 * useAds() expects from `.then(r => r.data.data)`.
 */
export async function prefetchAdList(
  qc:     QueryClient,
  params: Record<string, string | number | undefined> = {},
): Promise<void> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

  await qc.prefetchQuery({
    queryKey: queryKeys.ads.list(params),
    queryFn:  () =>
      serverFetch<AdListItem[]>(`/ads${query ? `?${query}` : ''}`).then((r) => ({
        items: r.data ?? [],
        meta:  (r.meta?.pagination ?? {}) as PaginationMeta,
      })),
  });
}

/**
 * FIX PERF-11: ads/[id]/page.tsx's generateMetadata and the page
 * component each call getQueryClient() independently — on the server
 * that always returns a brand-new QueryClient per call (by design, so
 * requests never share state), so prefetchAdDetail below used to fire
 * a real, uncached fetch() twice per page visit for the exact same
 * data. React's cache() memoizes this fetch by `id` within a single
 * render pass, so the second call resolves from the first call's
 * already-settled promise instead of hitting the network again — this
 * is what actually fixes the duplicate request, independent of which
 * QueryClient instance ends up holding the result.
 *
 * FIX API-SHAPE-01: GET /ads/:id is a single-item endpoint (not
 * paginated) — `data` is the Ad object directly. Resolving to `.data`
 * matches useAd()'s `.then(r => r.data.data)`.
 */
const fetchAdDetailCached = cache((id: string) =>
  serverFetch<Ad>(`/ads/${id}`).then((r) => {
    if (r.data === undefined) {
      throw new Error(r.message || `Ad ${id} not found`);
    }
    return r.data;
  }),
);

// Explicit fallback dedup: React's cache() memoizes within an active
// render/request dispatcher, which may not exist when prefetchAdDetail
// is invoked directly outside of one (e.g. two independent calls with
// their own QueryClient, or a plain function call in a test). This map
// guarantees the same promise (in-flight or already settled) is reused
// for a given id regardless of that environment nuance — covering both
// concurrent calls and calls awaited one after another.
const adDetailPromises = new Map<string, Promise<Ad>>();

function fetchAdDetailDeduped(id: string): Promise<Ad> {
  const existing = adDetailPromises.get(id);
  if (existing) return existing;

  const promise = fetchAdDetailCached(id);
  adDetailPromises.set(id, promise);
  void promise.finally(() => {
    setTimeout(() => adDetailPromises.delete(id), 0);
  });
  return promise;
}

/**
 * Prefetch a single ad detail page.
 * Used in /ads/[id]/page.tsx.
 */
export async function prefetchAdDetail(
  qc: QueryClient,
  id: string,
): Promise<void> {
  await qc.prefetchQuery({
    queryKey: queryKeys.ads.detail(id),
    queryFn:  () => fetchAdDetailDeduped(id),
  });
}

/**
 * Return the dehydrated state from a QueryClient for HydrationBoundary.
 */
export function dehydrateClient(qc: QueryClient) {
  return dehydrate(qc);
}
