'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { SavedSearch } from '@/types/savedSearch.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

/** GET /saved-searches — مع كاش أوفلاين (حدّ الخادم 20 أصلًا). */
export function useSavedSearches() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const cached = getOfflineList<SavedSearch>(OFFLINE_LIST_KEYS.savedSearches);

  const query = useQuery({
    queryKey: queryKeys.savedSearches.all(),
    queryFn: async () => {
      try {
        const data = await savedSearchesApi.getAll();
        saveOfflineList(
          OFFLINE_LIST_KEYS.savedSearches,
          data ?? [],
          OFFLINE_LIST_LIMITS.savedSearches,
        );
        return data;
      } catch (err) {
        const local = getOfflineList<SavedSearch>(OFFLINE_LIST_KEYS.savedSearches);
        if (local?.items.length) return local.items;
        throw err;
      }
    },
    staleTime: CACHE_TTL.savedSearches,
    enabled: isAuthenticated && (hasToken || !isOnline),
    ...(cached && cached.items.length > 0
      ? {
          initialData: cached.items,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });

  useEffect(() => {
    if (query.data) {
      saveOfflineList(
        OFFLINE_LIST_KEYS.savedSearches,
        query.data,
        OFFLINE_LIST_LIMITS.savedSearches,
      );
    }
  }, [query.data]);

  return query;
}
