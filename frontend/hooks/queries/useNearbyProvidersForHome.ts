'use client';

import { useEffect, useState } from 'react';
import { useNearbyServiceProviders } from '@/hooks/queries/useServiceProviders';

const RADIUS_KM = 10;
const HOME_LIMIT = 6;

type PermissionState = 'checking' | 'granted' | 'not-granted';

/**
 * FEAT-HOME-NEARBY-PROVIDERS: silent-permission variant of
 * NearbyServiceProviders.tsx's own GPS flow, built specifically for
 * the homepage section. Deliberately never calls
 * navigator.geolocation.getCurrentPosition() on its own — that always
 * shows the browser's permission prompt on first call, and prompting
 * for location the instant someone lands on Home (before they've
 * chosen to browse anything, let alone services) is the exact
 * surprise-permission-request pattern this section is designed to
 * avoid.
 *
 * Instead this only ever reads the *existing* permission state via
 * navigator.permissions.query({ name: 'geolocation' }) — a check that
 * never triggers a prompt by itself:
 *   - 'granted'  → the user already said yes on some earlier visit
 *                  (e.g. via NearbyServiceProviders.tsx's own explicit
 *                  "استخدام موقعي الحالي" button). Safe to call
 *                  getCurrentPosition() here too: the browser will not
 *                  prompt again since permission is already granted,
 *                  it just returns the position.
 *   - 'prompt'   → no decision made yet (the common default on a
 *                  first visit). Treated as "no section" — Home must
 *                  never be the place that first asks.
 *   - 'denied'   → user said no previously. Same as 'prompt': no
 *                  section, no repeated ask.
 *
 * Not all browsers support the Permissions API for 'geolocation'
 * (notably older Safari) — if navigator.permissions is missing, or
 * the query rejects/throws, this fails safe to 'not-granted' (hide
 * the section) rather than guessing or falling back to a prompt.
 *
 * No caching/storage layer is introduced here: this reads the
 * browser's own permission state fresh on every mount, exactly once,
 * and holds nothing in localStorage — same "no new storage system"
 * constraint NearbyServiceProviders.tsx already operates under.
 */
export function useNearbyProvidersForHome() {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAndMaybeLocate() {
      if (!('geolocation' in navigator) || !('permissions' in navigator)) {
        if (!cancelled) setPermission('not-granted');
        return;
      }

      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;

        if (status.state !== 'granted') {
          setPermission('not-granted');
          return;
        }

        // Permission is already granted — getCurrentPosition() will
        // resolve directly with no prompt shown.
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setPermission('granted');
          },
          () => {
            if (!cancelled) setPermission('not-granted');
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
        );
      } catch {
        if (!cancelled) setPermission('not-granted');
      }
    }

    checkAndMaybeLocate();
    return () => {
      cancelled = true;
    };
  }, []);

  const params = permission === 'granted' && coords
    ? { lat: coords.lat, lng: coords.lng, radius: RADIUS_KM, limit: HOME_LIMIT }
    : null;

  const query = useNearbyServiceProviders(params);

  return {
    /** True while the permission check itself (or the resulting
     * getCurrentPosition call) is still pending. Distinct from the
     * query's own isLoading, which only starts once params is set. */
    isChecking: permission === 'checking',
    /** Whole section should render nothing when this is false. */
    show: permission === 'granted',
    ...query,
  };
}
