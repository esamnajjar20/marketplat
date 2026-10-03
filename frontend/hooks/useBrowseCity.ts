'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { CITIES } from '@/lib/constants';
import {
  readBrowseCity,
  writeBrowseCity,
  subscribeBrowseCity,
  BROWSE_ALL_CITIES,
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

  const [guestPreference, setGuestPreference] = useState<string | typeof BROWSE_ALL_CITIES | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const saved = readBrowseCity();
    return saved === BROWSE_ALL_CITIES ? BROWSE_ALL_CITIES : matchKnownCity(saved);
  });
  const [guestReady, setGuestReady] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    const saved = readBrowseCity();
    setGuestPreference(saved === BROWSE_ALL_CITIES ? BROWSE_ALL_CITIES : matchKnownCity(saved));
    setGuestReady(true);
    return subscribeBrowseCity(() => {
      const next = readBrowseCity();
      setGuestPreference(next === BROWSE_ALL_CITIES ? BROWSE_ALL_CITIES : matchKnownCity(next));
    });
  }, []);

  const setCity = useCallback((city: string | undefined) => {
    writeBrowseCity(city);
    setGuestPreference(city ? matchKnownCity(city) : BROWSE_ALL_CITIES);
  }, []);

  // A saved browse choice overrides the profile city for the current device.
  // The profile city remains the default when no explicit browse choice exists.
  const hasExplicitBrowsePreference = guestPreference !== undefined;
  const city = guestPreference === BROWSE_ALL_CITIES ? undefined : guestPreference || profileCity;
  const source: 'profile' | 'guest' | 'none' = hasExplicitBrowsePreference
    ? 'guest'
    : profileCity
      ? 'profile'
      : 'none';

  const isReady = isHydrated && guestReady;

  return {
    city: isReady ? city : undefined,
    source,
    canChange: isReady,
    setCity,
    isReady,
  };
}
