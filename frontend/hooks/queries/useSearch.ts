'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchApi } from '@/api/search.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { searchOffline } from '@/lib/offlineSearchIndex';
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
export function useSearch(params?: SearchQuery) {
  return useQuery({
    queryKey: queryKeys.search.unified(params),
    queryFn: async () => {
      try {
        const r = await searchApi.search(params);
        return r.data.data;
      } catch (err) {
        const offline = await searchOffline(params ?? {}).catch(() => null);
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
    queryFn:   () => searchApi.suggest({ q }).then((r) => r.data.data?.suggestions ?? []),
    staleTime: CACHE_TTL.searchSuggestions,
    enabled:   q.trim().length >= 2,
  });
}
