import type { MetadataRoute } from 'next';
import { APP_URL, API_BASE_URL } from '@/lib/constants';

/**
 * Dynamic sitemap — /sitemap.xml
 *
 * Includes:
 *  1. Static pages (home, search, category index).
 *  2. Category pages — fetched at build/revalidation time.
 *  3. Active ad detail pages — fetched in batches (up to MAX_ADS_IN_SITEMAP).
 *
 * Revalidates every 6 hours via ISR so new ads appear without a full rebuild.
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

interface PaginationMeta {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

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
  try {
    const res = await fetch(`${API_BASE_URL}/categories`, {
      next: { revalidate },
    });
    if (!res.ok) return [];
    // GET /categories: data is CategoryApiItem[] directly (not paginated)
    const json = (await res.json()) as CategoryEnvelope;
    return json.data ?? [];
  } catch {
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

  while (allAds.length < MAX_ADS_IN_SITEMAP) {
    let res: Response;
    try {
      res = await fetch(
        `${API_BASE_URL}/ads?limit=${ADS_PAGE_SIZE}&page=${page}&status=ACTIVE`,
        { next: { revalidate } },
      );
    } catch (err) {
            console.error('[sitemap] network error fetching ads page', page, err);
      break;
    }

    if (!res.ok) {
            console.error('[sitemap] non-OK response fetching ads page', page, res.status);
      break;
    }

    // FIX API-SHAPE-01: `data` is the array of ads directly; pagination
    // info is under the top-level `meta.pagination`, not `data.meta`.
    const json = (await res.json()) as AdPaginatedEnvelope;
    const items = json.data ?? [];
    if (items.length === 0) break;

    allAds.push(...items);

    const totalPages = json.meta?.pagination?.totalPages ?? page;
    if (page >= totalPages) break;
    page += 1;
  }

  return allAds.slice(0, MAX_ADS_IN_SITEMAP);
}

// ── Sitemap builder ───────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, ads] = await Promise.all([
    fetchCategories(),
    fetchActiveAdIds(),
  ]);

  // 1. Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url:              APP_URL,
      lastModified:     new Date(),
      changeFrequency:  'daily',
      priority:         1.0,
    },
    {
      url:              `${APP_URL}/search`,
      lastModified:     new Date(),
      changeFrequency:  'always',
      priority:         0.8,
    },
  ];

  // 2. Category pages
  // SEC-03 FIX: encodeURIComponent() applied to API-sourced slug to prevent
  // malformed or injected URLs if a slug contains special characters.
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url:             `${APP_URL}/categories/${encodeURIComponent(cat.slug)}`,
    lastModified:    cat.updatedAt ? new Date(cat.updatedAt) : new Date(),
    changeFrequency: 'daily' as const,
    priority:        0.7,
  }));

  // 3. Ad detail pages
  // SEC-03 FIX: encodeURIComponent() applied to API-sourced ad ID.
  const adRoutes: MetadataRoute.Sitemap = ads.map((ad) => ({
    url:             `${APP_URL}/ads/${encodeURIComponent(ad.id)}`,
    lastModified:    new Date(ad.updatedAt),
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }));

  return [...staticRoutes, ...categoryRoutes, ...adRoutes];
}
