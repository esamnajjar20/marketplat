'use client';

import { useQuery } from '@tanstack/react-query';
import { activityApi } from '@/api/activity.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { ActivityQuery, UserActivity } from '@/types/activity.types';
import type { PaginationMeta } from '@/types/api.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

function offlineMeta(count: number): PaginationMeta {
  return {
    total: count,
    page: 1,
    limit: count,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

/** GET /activity — آخر النشاط مع كاش أوفلاين محدود. */
export function useMyActivity(params?: ActivityQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // FIX ACTIVITY-OFFLINE-CACHE-SCOPE-01: `isBase` only checked page,
  // but ActivityQuery (types/activity.types.ts) also carries three
  // filter fields — type, group, and q. A type-filtered or
  // search-filtered first page was therefore written into the
  // generic activity offline slot, so a later unfiltered offline
  // open of /activity served only that subset back to the user.
  // Same class as ADS-OFFLINE-CACHE-SCOPE-01/-02 in useAds and
  // APPT-OFFLINE-CACHE-SCOPE-01 in useMyAppointments — third
  // instance of the same pattern, closed the same way.
  // T760-octies — also exclude a non-default `limit`. ActivityQuery
  // carries `limit` alongside page/type/group/q; a caller that passes
  // a smaller limit (a preview rail, a compact widget) requests a
  // different result SHAPE than the /activity page's own request. The
  // previous guard missed it, so that subset was written into the
  // shared activity offline slot — a later unfiltered offline open of
  // /activity then showed that shorter list. Same class the sibling
  // hooks useStores/useServiceListings/useAds/useProducts already
  // closed under T760.
  // T760-octies-deux — treat `group: 'ALL'` as no-filter, matching the
  // backend's own semantics (see activity.validation.ts: "'ALL' is
  // accepted but treated identically to omitting group entirely — no
  // WHERE clause narrowing"). The previous `Boolean(params?.group)`
  // treated 'ALL' as a filter, so Timeline.tsx — the actual /activity
  // page, whose default useState is group='ALL' — never passed the
  // isBase check and the offline slot for `activity` was never
  // populated by its normal page visit. A user going offline then
  // opening /activity saw an empty screen. The check now matches what
  // the backend actually does with this value.
  const hasRealFilter =
    Boolean(params?.type) ||
    (params?.group !== undefined && params.group !== 'ALL') ||
    Boolean(params?.q) ||
    params?.limit !== undefined;
  const isBase = (!params?.page || params.page === 1) && !hasRealFilter;
  const cached = isBase
    ? getOfflineList<UserActivity>(OFFLINE_LIST_KEYS.activity)
    : null;

  // FIX ACTIVITY-DOUBLE-SAVE-01: the offline list was being written
  // twice on every successful fetch -- once inside queryFn and once in
  // a useEffect keyed on query.data. Both write the exact same items
  // with the same limit, so the second pass is pure waste (a second
  // JSON.stringify + localStorage.setItem per fetch), and worse, the
  // effect can fire late enough to overwrite a newer write from an
  // in-flight follow-up fetch. Every other offline-cached list hook in
  // this project (useAds, useStores, useMyFollowedStores) writes only
  // from queryFn; the effect was unique to this file and redundant.
  return useQuery({
    queryKey: queryKeys.activity.mine(params),
    queryFn: async () => {
      try {
        const data = await activityApi.getMine(params).then((r) => r.data.data);
        if (isBase && data?.items) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.activity,
            data.items,
            OFFLINE_LIST_LIMITS.activity,
          );
        }
        return data;
      } catch (err) {
        if (isBase) {
          const local = getOfflineList<UserActivity>(OFFLINE_LIST_KEYS.activity);
          if (local?.items.length) {
            return {
              items: local.items,
              meta: offlineMeta(local.items.length),
            };
          }
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.activity,
    enabled: isAuthenticated && (hasToken || !isOnline),
    ...(cached && cached.items.length > 0
      ? {
          initialData: {
            items: cached.items,
            meta: offlineMeta(cached.items.length),
          },
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });
}
