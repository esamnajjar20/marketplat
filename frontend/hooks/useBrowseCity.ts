'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import {
  readBrowseCity,
  writeBrowseCity,
  subscribeBrowseCity,
} from '@/lib/browseCity';

/**
 * Effective homepage city filter:
 *   profile city (logged-in) → local browse city (guest chip) → undefined
 *
 * Guest city is read synchronously on first client render (lazy useState)
 * so useHomepage does not enable with city=undefined then immediately
 * re-key to city=X (abort → Network status 0 + double /home).
 */
export function useBrowseCity() {
  const isHydrated = useAuthStore(selectIsHydrated);
  const profileCity = useAuthStore((s) => s.user?.city?.trim() || undefined);

  const [guestCity, setGuestCity] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return readBrowseCity();
  });
  const [guestReady, setGuestReady] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    setGuestCity(readBrowseCity());
    setGuestReady(true);
    return subscribeBrowseCity(() => setGuestCity(readBrowseCity()));
  }, []);

  const setCity = useCallback((city: string | undefined) => {
    writeBrowseCity(city);
    setGuestCity(city?.trim() || undefined);
  }, []);

  const city = profileCity || guestCity;
  const source: 'profile' | 'guest' | 'none' = profileCity
    ? 'profile'
    : guestCity
      ? 'guest'
      : 'none';

  const isReady = isHydrated && guestReady;

  return {
    city: isReady ? city : undefined,
    source,
    canChange: isReady && !profileCity,
    setCity,
    isReady,
  };
}
