'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { getOfflineList } from '@/lib/offlineListCache';

/**
 * Seeds a query from the local offline list only after the first client
 * hydration render. Reading localStorage during render made server HTML
 * contain loading/empty UI while the browser rendered cached cards/options,
 * producing React #418 on browse pages with a warmed offline cache.
 *
 * Existing QueryClient data always wins. A successful in-flight request can
 * therefore replace this stale snapshot normally; the snapshot only fills a
 * query that has no data yet (especially useful when the browser is offline).
 */
export function useOfflineListSeed<TItem, TData>(options: {
  queryKey: QueryKey;
  cacheKey: string;
  enabled?: boolean;
  mapItems: (items: TItem[]) => TData;
}): void {
  const queryClient = useQueryClient();
  const mapItemsRef = useRef(options.mapItems);
  mapItemsRef.current = options.mapItems;
  // Serialize the key so the effect is stable when callers construct an
  // equivalent query-key array on each render. TanStack query keys are JSON
  // serializable by contract.
  const queryKeyJson = JSON.stringify(options.queryKey);

  useEffect(() => {
    if (options.enabled === false) return;

    let queryKey: QueryKey;
    try {
      queryKey = JSON.parse(queryKeyJson) as QueryKey;
    } catch {
      return;
    }

    if (queryClient.getQueryData(queryKey) !== undefined) return;

    const cached = getOfflineList<TItem>(options.cacheKey);
    if (!cached?.items?.length) return;

    const parsedSavedAt = Date.parse(cached.savedAt);
    queryClient.setQueryData<TData>(queryKey, mapItemsRef.current(cached.items), {
      updatedAt: Number.isFinite(parsedSavedAt) && parsedSavedAt > 0 ? parsedSavedAt : Date.now(),
    });
  }, [queryClient, queryKeyJson, options.cacheKey, options.enabled]);
}
