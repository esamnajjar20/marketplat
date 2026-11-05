'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchApi } from '@/api/search.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { searchOffline as SearchOfflineFn } from '@/lib/offlineSearchIndex';
import type { SearchQuery } from '@/types/search.types';

/**
 * GET /search — unified cross-entity search (ads + products + stores +
 * service-listings). Always enabled, same as useAds — the caller (see
 * SearchResults-equivalent component) decides when to render/branch,
 * not this hook. Unlike useSearchAds there's no q-length gate here:
 * an empty q is a valid "browse everything, ranked by relevance
 * fallback" request on this endpoint (see backend's search.repository.ts
 * — rank defaults to 0 with no q, ordering falls back to recency),
 * not an error state.
 *
 * (بحث محلي بدون نت): لو فشل طلب الشبكة، نحاول فهرس محلي مبني من
 * حزمة المرحلة ١ (lib/offlineCoreBundle.ts) قبل الاستسلام. لو الفهرس نفسه
 * غير متوفر (لا حزمة أساسية بعد) نرمي خطأ الشبكة الأصلي — فيبقى isError/
 * زر "إعادة المحاولة" بـ SearchResults.tsx يعمل بشكل صحيح لأي خطأ حقيقي،
 * لا يُخفى بصمت خلف نتيجة محلية مزيّفة.
 */
// PERF: the offline search index (+ core bundle + warming planner, ~50 KB of
// source) is only needed when the network request fails, so it is loaded on
// demand instead of being part of the home page's first-load JS. It is warmed
// during browser idle time so it is already cached when the user goes offline.
const loadSearchOffline = (): Promise<typeof SearchOfflineFn> =>
  import('@/lib/offlineSearchIndex').then((m) => m.searchOffline);

let searchOfflineWarmScheduled = false;
function warmSearchOfflineChunk(): void {
  if (searchOfflineWarmScheduled || typeof window === 'undefined') return;
  searchOfflineWarmScheduled = true;
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const warm = () => { void loadSearchOffline().catch(() => undefined); };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm, { timeout: 8000 });
  else window.setTimeout(warm, 5000);
}

export function useSearch(params?: SearchQuery) {
  warmSearchOfflineChunk();
  return useQuery({
    queryKey: queryKeys.search.unified(params),
    queryFn: async ({ signal }) => {
      try {
        const r = await searchApi.search(params, { signal });
        return r.data.data;
      } catch (err) {
        if (signal.aborted || (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'ERR_CANCELED')) throw err;
        const offline = await loadSearchOffline()
          .then((fn) => fn(params ?? {}))
          .catch(() => null);
        if (offline?.hasBundle) {
          return { items: offline.items, meta: offline.meta };
        }
        throw err;
      }
    },
    placeholderData: keepPreviousData, // prevents flash when changing tabs/pages
    staleTime:       CACHE_TTL.search,
  });
}

/**
 * GET /search/suggestions — autocomplete. Gated at >= 2 trimmed
 * characters, same threshold useSearchAds already established for its
 * own search-vs-browse split — a 1-character prefix matches too much
 * to be a useful suggestion list and would fire on literally the first
 * keystroke.
 */
export function useSearchSuggestions(q: string) {
  return useQuery({
    queryKey:  queryKeys.search.suggestions(q),
    queryFn:   ({ signal }) => searchApi.suggest({ q }, { signal }).then((r) => r.data.data?.suggestions ?? []),
    staleTime: CACHE_TTL.searchSuggestions,
    enabled:   q.trim().length >= 2,
  });
}
