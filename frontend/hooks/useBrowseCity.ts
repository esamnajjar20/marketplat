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
 * The saved guest city is loaded after mount, never during the initial render.
 * Reading localStorage in a lazy useState initializer made the server render
 * without a city while the first browser render could include one, causing a
 * hydration mismatch in BrowseCityHint on /products and other consumers.
 * Query consumers should use isReady when they need to wait for this preference.
 */
export function useBrowseCity() {
  const isHydrated = useAuthStore(selectIsHydrated);
  const rawProfileCity = useAuthStore((s) => s.user?.city);
  const profileCity = matchKnownCity(rawProfileCity);

  // Keep the server render and the browser's first hydration render identical.
  // localStorage is intentionally read only inside the mount effect below.
  const [guestPreference, setGuestPreference] = useState<string | typeof BROWSE_ALL_CITIES | undefined>(undefined);
  const [guestReady, setGuestReady] = useState(false);

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
    // FIX HOME-CITY-EXPLICIT-ALL: true only when the user actively picked
    // "كل المدن" and hydration finished. The homepage uses this to send
    // ?city=__ALL__ instead of omitting the param (which the backend would
    // otherwise treat as "no preference" → profile city).
    explicitAll: isReady && guestPreference === BROWSE_ALL_CITIES,
  };
}
