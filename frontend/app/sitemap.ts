import type { MetadataRoute } from 'next';
import { APP_URL, API_BASE_URL, ROUTES } from '@/lib/constants';
import type { PaginationMeta } from '@/types/api.types';

/**
 * Dynamic sitemap — /sitemap.xml
 *
 * Includes:
 *  1. Static pages (home, search, category index).
 *  2. Category pages — fetched at build/revalidation time.
 *  3. Active ad detail pages — fetched in batches (up to MAX_ADS_IN_SITEMAP).
 *  4. Store, product and service-listing detail pages (public lists only).
 *
 * Revalidates every 6 hours via ISR so new ads appear without a full rebuild.
 *
 * FIX BUILD-TIMEOUT-01: every backend fetch below is bounded by an
 *   AbortController timeout (FETCH_TIMEOUT_MS). Vercel kills static
 *   generation for a route after 60s; an unreachable/slow backend must
 *   never be able to hang the build past that. On timeout, non-OK
 *   response, network error, or malformed JSON, the helper logs a
 *   concise warning and returns an empty list so the sitemap still
 *   builds with whatever static routes are available.
 *
 * FIX API-SHAPE-01 (supersedes the old FIX N-01 comment below, which
 *   had the shape backwards): the backend's successResponse()
 *   (api-response.types.ts) puts a list's items directly on the
 *   top-level `data` field, and pagination info under the top-level
 *   `meta` field as `meta.pagination` — NOT `data.items`/`data.meta`:
 *     res.json(successResponse('Ads fetched', result.items, { pagination: result.meta }))
 *     → { success, message, data: AdApiItem[], meta: { pagination: {...} } }
 *   fetchCategories uses GET /categories, which isn't paginated at all —
 *   `data` is a flat array with no `meta`.
 *   fetchActiveAdIds uses GET /ads — `data` is a flat array of ads,
 *   `meta.pagination` (not `data.meta`) holds { total, page, totalPages, ... }.
 */

export const revalidate = 21600; // 6 hours

const MAX_ADS_IN_SITEMAP = 5000;

// FIX SITEMAP-STORES-SERVICES (audit M1): stores / products / service
// listings have generateMetadata + JSON-LD on their detail pages but were
// missing from the sitemap. Smaller caps than ads: these catalogs are
// smaller, and every extra page is another bounded backend request.
const MAX_STORES_IN_SITEMAP = 2000;
const MAX_PRODUCTS_IN_SITEMAP = 5000;
const MAX_SERVICES_IN_SITEMAP = 3000;

// FIX BUILD-TIMEOUT-01: hard cap per backend request. Chosen so that even a
// worst-case fully-paginated ad fetch (MAX_ADS_IN_SITEMAP / ADS_PAGE_SIZE
// requests) has headroom under Vercel's 60s static-generation limit.
const FETCH_TIMEOUT_MS = 8000;

// FIX BUILD-TIMEOUT-01: safety ceiling on pagination iterations, independent
// of MAX_ADS_IN_SITEMAP/ADS_PAGE_SIZE math, so a backend returning a bogus
// `totalPages` (e.g. stuck > page, or a huge number) can't spin the loop
// indefinitely — it's bounded by request count, not just item count.
const MAX_AD_PAGES = 100;

/**
 * FIX BUILD-TIMEOUT-01: fetch() with an AbortController-based timeout.
 * Does not throw — callers get `null` on timeout, network error, or any
 * other fetch failure, log a warning, and fall back gracefully.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      next: { revalidate },
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(`[sitemap] fetch failed for ${url}: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Fetch helpers (raw fetch — no axios needed in Server Components) ──

interface CategoryApiItem {
  id: string;
  slug: string;
  updatedAt?: string;
}

interface AdApiItem {
  id: string;
  updatedAt: string;
}

// FIX PAGINATION-META-DEDUP: removed a local 4-field copy of
// PaginationMeta that shadowed the real one in @/types/api.types
// (which carries hasNextPage/hasPrevPage as well). sitemap.ts only
// reads the four shared fields today, so the duplicate worked —
// but a future field added to the canonical type would silently
// not exist here. Imported below instead.

/** FIX API-SHAPE-01: GET /categories returns a flat array in `data`, no pagination at all. */
interface CategoryEnvelope {
  success: boolean;
  data:    CategoryApiItem[];
}

/**
 * FIX API-SHAPE-01: GET /ads returns a flat array of ads in `data`, with
 * pagination info under the top-level `meta.pagination` — not `data.meta`.
 */
interface AdPaginatedEnvelope {
  success: boolean;
  data:    AdApiItem[];
  meta?:   { pagination?: PaginationMeta };
}

async function fetchCategories(): Promise<CategoryApiItem[]> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/categories`);
  if (!res) return []; // network error / timeout — already logged

  if (!res.ok) {
    console.warn(`[sitemap] categories fetch returned ${res.status}`);
    return [];
  }

  try {
    // GET /categories: data is CategoryApiItem[] directly (not paginated)
    const json = (await res.json()) as CategoryEnvelope;
    return Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    console.warn('[sitemap] categories response was not valid JSON', err);
    return [];
  }
}

// FIX N-02: backend's getAdsSchema caps `limit` at 100 (z.number().max(100)).
// Requesting limit=5000 in a single call was rejected by Zod with a 400,
// which fetchActiveAdIds previously swallowed via `if (!res.ok) return []`,
// resulting in a sitemap that silently contained zero ad URLs on every build.
// Fixed by paginating in batches of the backend's actual max page size.
const ADS_PAGE_SIZE = 100;

async function fetchActiveAdIds(): Promise<AdApiItem[]> {
  const allAds: AdApiItem[] = [];
  let page = 1;
  let requestCount = 0;

  // FIX BUILD-TIMEOUT-01: bounded by both MAX_ADS_IN_SITEMAP (item count)
  // and MAX_AD_PAGES (request count), so malformed pagination data can't
  // cause an unbounded — or just very long — loop of backend calls.
  while (allAds.length < MAX_ADS_IN_SITEMAP && requestCount < MAX_AD_PAGES) {
    requestCount += 1;

    const res = await fetchWithTimeout(
      `${API_BASE_URL}/ads?limit=${ADS_PAGE_SIZE}&page=${page}&status=ACTIVE`,
    );
    if (!res) break; // network error / timeout — already logged

    if (!res.ok) {
      console.warn(`[sitemap] ads fetch page ${page} returned ${res.status}`);
      break;
    }

    let json: AdPaginatedEnvelope;
    try {
      json = (await res.json()) as AdPaginatedEnvelope;
    } catch (err) {
      console.warn(`[sitemap] ads response page ${page} was not valid JSON`, err);
      break;
    }

    // FIX API-SHAPE-01: `data` is the array of ads directly; pagination
    // info is under the top-level `meta.pagination`, not `data.meta`.
    const items = Array.isArray(json?.data) ? json.data : [];
    if (items.length === 0) break;

    allAds.push(...items);

    // FIX BUILD-TIMEOUT-01: validate totalPages is a sane, finite number
    // before trusting it to decide whether to keep paginating — guards
    // against the backend returning NaN, a non-number, or a value that
    // never lets `page >= totalPages` become true.
    const rawTotalPages = json.meta?.pagination?.totalPages;
    const totalPages =
      typeof rawTotalPages === 'number' && Number.isFinite(rawTotalPages)
        ? rawTotalPages
        : page; // unknown/invalid → assume this is the last page

    if (page >= totalPages) break;
    page += 1;
  }

  if (requestCount >= MAX_AD_PAGES) {
    console.warn(
      `[sitemap] stopped ad pagination after ${MAX_AD_PAGES} pages (safety cap)`,
    );
  }

  return allAds.slice(0, MAX_ADS_IN_SITEMAP);
}

interface PublicEntityApiItem {
  id: string;
  slug?: string | null;
  updatedAt?: string;
}

/**
 * Generic bounded pagination over a public list endpoint (same envelope as
 * GET /ads: flat array in `data`, pagination under `meta.pagination`).
 * Public endpoints already return only ACTIVE entities of non-suspended
 * sellers, so no extra status filter is needed here. Same safety rails as
 * fetchActiveAdIds: per-request timeout, page-count ceiling, sane
 * totalPages — a slow or malformed backend degrades to a shorter list,
 * never a hung build.
 */
async function fetchPublicEntities(
  path: string,
  maxItems: number,
): Promise<PublicEntityApiItem[]> {
  const all: PublicEntityApiItem[] = [];
  let page = 1;
  let requestCount = 0;

  while (all.length < maxItems && requestCount < MAX_AD_PAGES) {
    requestCount += 1;

    const res = await fetchWithTimeout(
      `${API_BASE_URL}${path}?limit=${ADS_PAGE_SIZE}&page=${page}`,
    );
    if (!res) break;
    if (!res.ok) {
      console.warn(`[sitemap] ${path} page ${page} returned ${res.status}`);
      break;
    }

    let json: AdPaginatedEnvelope;
    try {
      json = (await res.json()) as AdPaginatedEnvelope;
    } catch (err) {
      console.warn(`[sitemap] ${path} page ${page} was not valid JSON`, err);
      break;
    }

    const items = Array.isArray(json?.data)
      ? (json.data as unknown as PublicEntityApiItem[])
      : [];
    if (items.length === 0) break;
    all.push(...items);

    const rawTotalPages = json.meta?.pagination?.totalPages;
    const totalPages =
      typeof rawTotalPages === 'number' && Number.isFinite(rawTotalPages)
        ? rawTotalPages
        : page;
    if (page >= totalPages) break;
    page += 1;
  }

  return all.slice(0, maxItems);
}

/**
 * FIX BUILD-TIMEOUT-01: guards against a missing/malformed date string from
 * the backend producing an `Invalid Date`, which MetadataRoute.Sitemap would
 * otherwise serialize into a broken <lastmod> entry.
 */
function safeDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// ── Sitemap builder ───────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, ads, stores, products, services] = await Promise.all([
    fetchCategories(),
    fetchActiveAdIds(),
    fetchPublicEntities('/stores', MAX_STORES_IN_SITEMAP),
    fetchPublicEntities('/products', MAX_PRODUCTS_IN_SITEMAP),
    fetchPublicEntities('/service-listings', MAX_SERVICES_IN_SITEMAP),
  ]);

  // 1. Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url:              APP_URL,
      lastModified:     new Date(),
      changeFrequency:  'daily',
      priority:         1.0,
    },
    // ROUTE-FIX-01: /search removed — robots.ts disallows it (search result
    // pages aren't canonical content), so listing it here contradicted that.
    // Public browse hubs added instead.
    ...[ROUTES.ads, ROUTES.products, ROUTES.services, ROUTES.stores, ROUTES.requests, ROUTES.serviceProviders]
      .map((path) => ({
        url:              `${APP_URL}${path}`,
        lastModified:     new Date(),
        changeFrequency:  'daily' as const,
        priority:         0.8,
      })),
    {
      url:              `${APP_URL}/categories`,
      lastModified:     new Date(),
      changeFrequency:  'weekly',
      priority:         0.7,
    },
  ];

  // 2. Category pages
  // SEC-03 FIX: encodeURIComponent() applied to API-sourced slug to prevent
  // malformed or injected URLs if a slug contains special characters.
  // FIX BUILD-TIMEOUT-01: skip any entry missing its required slug/id
  // instead of emitting a broken "/categories/undefined" URL.
  const categoryRoutes: MetadataRoute.Sitemap = categories
    .filter((cat) => typeof cat?.slug === 'string' && cat.slug.length > 0)
    .map((cat) => ({
      url:             `${APP_URL}/categories/${encodeURIComponent(cat.slug)}`,
      lastModified:    safeDate(cat.updatedAt),
      changeFrequency: 'daily' as const,
      priority:        0.7,
    }));

  // 3. Ad detail pages
  // SEC-03 FIX: encodeURIComponent() applied to API-sourced ad ID.
  const adRoutes: MetadataRoute.Sitemap = ads
    .filter((ad) => typeof ad?.id === 'string' && ad.id.length > 0)
    .map((ad) => ({
      url:             `${APP_URL}/ads/${encodeURIComponent(ad.id)}`,
      lastModified:    safeDate(ad.updatedAt),
      changeFrequency: 'weekly' as const,
      priority:        0.6,
    }));

  // 4. Store / product / service detail pages (audit M1).
  // Stores are linked by slug when present (the canonical public URL; the
  // page also accepts the id as a fallback), otherwise by id.
  const storeRoutes: MetadataRoute.Sitemap = stores
    .map((st) => ({ key: st?.slug || st?.id, st }))
    .filter(({ key }) => typeof key === 'string' && key.length > 0)
    .map(({ key, st }) => ({
      url:             `${APP_URL}${ROUTES.stores}/${encodeURIComponent(key as string)}`,
      lastModified:    safeDate(st.updatedAt),
      changeFrequency: 'weekly' as const,
      priority:        0.6,
    }));

  const productRoutes: MetadataRoute.Sitemap = products
    .filter((p) => typeof p?.id === 'string' && p.id.length > 0)
    .map((p) => ({
      url:             `${APP_URL}${ROUTES.products}/${encodeURIComponent(p.id)}`,
      lastModified:    safeDate(p.updatedAt),
      changeFrequency: 'weekly' as const,
      priority:        0.5,
    }));

  const serviceRoutes: MetadataRoute.Sitemap = services
    .filter((sv) => typeof sv?.id === 'string' && sv.id.length > 0)
    .map((sv) => ({
      url:             `${APP_URL}${ROUTES.services}/${encodeURIComponent(sv.id)}`,
      lastModified:    safeDate(sv.updatedAt),
      changeFrequency: 'weekly' as const,
      priority:        0.5,
    }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...adRoutes,
    ...storeRoutes,
    ...productRoutes,
    ...serviceRoutes,
  ];
}
