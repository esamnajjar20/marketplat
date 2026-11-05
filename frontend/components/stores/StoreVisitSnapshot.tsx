'use client';

import { useEffect } from 'react';
import type { StoreWithSellerAndCounts } from '@/types/store.types';
import { saveVisitedPublicStore } from '@/lib/offlineVisitedPublicEntities';

/**
 * Persists the public store payload rendered by the Server Component so a
 * previously visited store remains available when the network is unavailable.
 * `lookupKey` is the actual route segment (UUID or slug), matching offline
 * navigation lookups without requiring a second GET /stores/:id.
 */
export function StoreVisitSnapshot({
  lookupKey,
  store,
}: {
  lookupKey: string;
  store: StoreWithSellerAndCounts;
}) {
  useEffect(() => {
    if (lookupKey && store?.id && store.status === 'ACTIVE') {
      saveVisitedPublicStore(lookupKey, store);
    }
  }, [lookupKey, store]);

  return null;
}
