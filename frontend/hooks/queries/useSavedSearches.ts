'use client';

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
// FIX SAVED-SEARCHES-DOUBLE-SAVE-01: the offline list was written
// twice per successful fetch -- once inside queryFn and once in a
// useEffect keyed on query.data. Both writes take the same array and
// same limit, so the effect added a second JSON.stringify +
// localStorage.setItem per fetch, and could fire late enough to
// clobber a newer write from a follow-up fetch. Same pattern as the
// useActivity fix.
import type { SavedSearch } from '@/types/savedSearch.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

export function useSavedSearches() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const cached = getOfflineList<SavedSearch>(OFFLINE_LIST_KEYS.savedSearches, userId);

  const query = useQuery({
    queryKey: queryKeys.savedSearches.all(),
    queryFn: async () => {
      try {
        const data = await savedSearchesApi.getAll();
        saveOfflineList(
          OFFLINE_LIST_KEYS.savedSearches,
          data ?? [],
          OFFLINE_LIST_LIMITS.savedSearches,
          userId,
        );
        return data;
      } catch (err) {
        const local = getOfflineList<SavedSearch>(OFFLINE_LIST_KEYS.savedSearches, userId);
        if (local) return local.items;
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

  return query;
}
