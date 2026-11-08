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
 * every prefetch function below used to store the
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
import { CACHE_TTL } from './constants';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import { getPublicApiCacheTags } from '@/lib/server/serverCacheTags';
import type { PaginationMeta } from '@/types/api.types';
import type { BrowsePage } from '@/types/browse.types';
import type { Category }    from '@/types/category.types';
import type { ProductCategory } from '@/types/product.types';
import type { ServiceCategory } from '@/types/service.types';
import type { AdListItem, Ad } from '@/types/ad.types';
import type { HomepagePayload } from '@/api/home.api';
import { homeFeedQueryKey, type HomeFeedPayload } from '@/api/home-feed.api';

// ── Public browse-page fetches ─────────────────────────────────────

/**
 * Fetch the first page of a public directory from a Server Component.
 * The result is deliberately kept in the same `{ items, meta }` shape
 * returned by the browser API clients' unwrapPaginated() helpers, so it
 * can seed an existing useInfiniteQuery without changing pagination.
 */
export async function fetchPublicBrowsePage<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  options: { revalidateSeconds?: number; timeoutMs?: number } = {},
): Promise<BrowsePage<T>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }

  const queryString = query.toString();
  const url = `${path}${queryString ? `?${queryString}` : ''}`;

  // Only the unfiltered first page with the canonical sort has useful,
  // bounded cache-key reuse. Category/city/price/condition/type/location and
  // free-text filters can all have high cardinality; keep them SSR-rendered,
  // but bypass persistent Data Cache to avoid one entry per filter combination.
  // Unknown future parameters are also no-store until explicitly reviewed.
  const cacheableParams = new Set(['page', 'limit', 'sortBy', 'sortOrder']);
  const meaningfulParams = Object.entries(params).filter(([, value]) =>
    value !== undefined && value !== null && String(value).trim() !== ''
  );
  const isCanonicalDefaultList = meaningfulParams.every(([key, value]) => {
    if (!cacheableParams.has(key)) return false;
    if (key === 'page') return Number(value) === 1;
    if (key === 'limit') return Number(value) === 10;
    if (key === 'sortBy') return value === 'createdAt';
    if (key === 'sortOrder') return value === 'desc';
    return false;
  });
  const bypassPublicCache = !isCanonicalDefaultList;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const response = bypassPublicCache
    ? await fetchServerApi<T[]>(url, { mode: 'no-store', timeoutMs })
    : await fetchServerApi<T[]>(url, {
        mode: 'public',
        revalidateSeconds: options.revalidateSeconds ?? 60,
        tags: getPublicApiCacheTags(path),
        timeoutMs,
      });
  if (!Array.isArray(response.data)) {
    throw new Error('Public browse response did not contain a list');
  }

  const pagination = response.meta?.pagination as PaginationMeta | undefined;
  if (!pagination) {
    throw new Error('Public browse response did not contain pagination metadata');
  }

  return {
    items: response.data,
    meta: pagination,
  };
}

// ── Prefetch functions ────────────────────────────────────────────

/**
 * Prefetch the categories list.
 * Used in the homepage and search page server components.
 *
 * GET /categories is not paginated — `data` is a
 * flat Category[] already. Resolving the prefetch to `.data` (not the
 * whole envelope) matches useCategories()'s `.then(r => r.data.data)`.
 */
export async function prefetchCategories(qc: QueryClient): Promise<void> {
  await qc.prefetchQuery({
    queryKey: queryKeys.categories.all(),
    queryFn:  () => fetchServerApi<Category[]>('/categories', {
      mode: 'public', revalidateSeconds: 300, tags: getPublicApiCacheTags('/categories'),
    }).then((r) => r.data ?? []),
    staleTime: CACHE_TTL.categories,
  });
}

/**
 * Prefetch the three small public taxonomy resources used by /categories.
 * Do not fetch /home here: that aggregate also contains product, store,
 * service, provider, carousel, recommendation and statistics payloads.
 * The query keys and unwrapped array shapes intentionally match the three
 * existing category hooks, including their offline snapshot fallback.
 */
export async function prefetchCategoryCatalog(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.prefetchQuery({
      queryKey: queryKeys.categories.all(),
      queryFn: () => fetchServerApi<Category[]>('/categories', {
        mode: 'public', revalidateSeconds: 300, tags: getPublicApiCacheTags('/categories'),
      }).then((response) => response.data ?? []),
      staleTime: CACHE_TTL.categories,
    }),
    qc.prefetchQuery({
      queryKey: queryKeys.productCategories.all(),
      queryFn: () => fetchServerApi<ProductCategory[]>('/product-categories', {
        mode: 'public', revalidateSeconds: 300, tags: getPublicApiCacheTags('/product-categories'),
      }).then((response) => response.data ?? []),
      staleTime: CACHE_TTL.categories,
    }),
    qc.prefetchQuery({
      queryKey: queryKeys.serviceCategories.all(),
      queryFn: () => fetchServerApi<ServiceCategory[]>('/service-categories', {
        mode: 'public', revalidateSeconds: 300, tags: getPublicApiCacheTags('/service-categories'),
      }).then((response) => response.data ?? []),
      staleTime: CACHE_TTL.categories,
    }),
  ]);
}

/**
 * Prefetch the active ad list for a given search.
 * Used in category pages and search results.
 *
 * GET /ads puts the ad array directly on `data` and
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
      fetchServerApi<AdListItem[]>(`/ads${query ? `?${query}` : ''}`, {
        mode: 'public', revalidateSeconds: 60, tags: getPublicApiCacheTags('/ads'),
      }).then((r) => ({
        items: r.data ?? [],
        meta:  (r.meta?.pagination ?? {}) as PaginationMeta,
      })),
    staleTime: CACHE_TTL.adsList,
  });
}

/**
 * ads/[id]/page.tsx's generateMetadata and the page
 * component each call getQueryClient() independently — on the server
 * that always returns a brand-new QueryClient per call (by design, so
 * requests never share state), so prefetchAdDetail below used to fire
 * a real, uncached fetch() twice per page visit for the exact same
 * data. React's cache() memoizes this fetch by `id` within a single
 * render pass, so the second call resolves from the first call's
 * already-settled promise instead of hitting the network again — this
 * is what actually the duplicate request, independent of which
 * QueryClient instance ends up holding the result.
 *
 * GET /ads/:id is a single-item endpoint (not
 * paginated) — `data` is the Ad object directly. Resolving to `.data`
 * matches useAd()'s `.then(r => r.data.data)`.
 */
const fetchAdDetailCached = cache((id: string) =>
  // The API increments the ad view buffer on this endpoint. Do not add a
  // second 60-second Next Data Cache in front of the API's own edge policy;
  // keep deduplication scoped to this React request instead.
  fetchServerApi<Ad>(`/ads/${encodeURIComponent(id)}`, { mode: 'no-store' }).then((r) => {
    if (r.data === undefined) {
      throw new Error(r.message || `Ad ${id} not found`);
    }
    return r.data;
  }),
);

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
    queryFn:  () => fetchAdDetailCached(id),
    staleTime: CACHE_TTL.adDetail,
  });
}

/**
 * Return the dehydrated state from a QueryClient for HydrationBoundary.
 */
export function dehydrateClient(qc: QueryClient) {
  return dehydrate(qc);
}


/**
 * Prefetch the guest (no-city) homepage payload.
 *
 * Stored under the exact key useHomepage() reads for "no city", and resolved
 * to the same unwrapped payload as its `.then(r => r.data.data)`. Visitors
 * with a profile/browse city still fetch their own variant on the client
 * (keepPreviousData shows this general payload meanwhile).
 *
 * prefetchQuery never throws: if the backend is down the query is simply
 * left out of the dehydrated state and the client fetches as before.
 */
export async function prefetchHomepage(
  qc: QueryClient,
  timeoutMs: number = HOME_PREFETCH_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    // Never let a cold/slow backend hold the whole HTML hostage: if /home is
    // not back within the budget, ship the page without it and let the client
    // fetch (the un-awaited request is simply left out of dehydrate()).
    await Promise.race([
      qc.prefetchQuery({
        queryKey: queryKeys.home.page(undefined),
        queryFn:  async () => {
          const res = await fetchServerApi<HomepagePayload>('/home', {
            mode: 'public', revalidateSeconds: 60, tags: getPublicApiCacheTags('/home'),
          });
          if (!res.data) throw new Error('empty /home response');
          return res.data;
        },
        staleTime: 60 * 1000,
      }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Max time the server waits for the guest home feed before rendering the shell. */
const HOME_PREFETCH_TIMEOUT_MS = 1200;


/**
 * Prefetch the single guest homepage feed. The client hook uses the same key
 * so the first render can hydrate without issuing a second request.
 */
export async function prefetchHomeFeed(
  qc: QueryClient,
  timeoutMs: number = HOME_PREFETCH_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([
      qc.prefetchQuery({
        queryKey: homeFeedQueryKey(undefined, null, false),
        queryFn: async () => {
          // Guest SSR: the public /home/static is served from the Cloudflare edge
          // (the private /home/feed always went to Render).
          const res = await fetchServerApi<HomeFeedPayload>('/home/static', {
            mode: 'public', revalidateSeconds: 60, tags: getPublicApiCacheTags('/home/static'),
          });
          if (!res.data) throw new Error('empty /home/static response');
          return res.data;
        },
        staleTime: 60_000,
      }),
      timeout,
    ]);
  } catch (error) {
    console.error('[prefetchHomeFeed] failed:', error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
