'use client';

import { useHomepage } from '@/hooks/queries/useHomepage';
import type { HomepagePayload } from '@/api/home.api';

/**
 * Gate individual homepage section fetches behind GET /home.
 *
 * While /home is pending → do not fire section requests (prevents the
 * N+1 fan-out seen in Network when carousel/categories/products all
 * raced /home).
 * After /home succeeds with usable data → keep section query disabled.
 * After /home errors or omits that slice → enable the section's own query.
 */
export function useHomeSectionGate(hasSeededData: boolean) {
  const home = useHomepage();

  const allowFallbackFetch =
    home.isError || (home.isSuccess && !hasSeededData);

  return {
    home: home.data as HomepagePayload | undefined,
    homePending: home.isPending,
    homeError: home.isError,
    /** Pass to useAds/useProducts/… as `enabled` */
    enabled: allowFallbackFetch,
    refetchHome: home.refetch,
  };
}
