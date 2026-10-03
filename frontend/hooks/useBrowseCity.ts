'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { CITIES } from '@/lib/constants';
import {
  readBrowseCity,
  writeBrowseCity,
  subscribeBrowseCity,
} from '@/lib/browseCity';

/**
 * /home only understands the fixed CITIES list (the backend treats anything
 * else as "no city"). A free-text profile city such as "غزة " or "Gaza" must
 * not be shown as an active filter while the results are actually general.
 */
function matchKnownCity(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  return (CITIES as readonly string[]).includes(normalized) ? normalized : undefined;
}

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
  const rawProfileCity = useAuthStore((s) => s.user?.city);
  const profileCity = matchKnownCity(rawProfileCity);

  const [guestCity, setGuestCity] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return matchKnownCity(readBrowseCity());
  });
  const [guestReady, setGuestReady] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    setGuestCity(matchKnownCity(readBrowseCity()));
    setGuestReady(true);
    return subscribeBrowseCity(() => setGuestCity(readBrowseCity()));
  }, []);

  const setCity = useCallback((city: string | undefined) => {
    writeBrowseCity(city);
    setGuestCity(matchKnownCity(city));
  }, []);

  // A saved browse choice overrides the profile city for the current device.
  // The profile city remains the default when no explicit browse choice exists.
  const city = guestCity || profileCity;
  const source: 'profile' | 'guest' | 'none' = guestCity
    ? 'guest'
    : profileCity
      ? 'profile'
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
