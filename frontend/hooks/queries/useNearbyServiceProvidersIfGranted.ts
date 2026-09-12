'use client';

import { GEO_POSITION_OPTIONS, isUsableNearbyCoord } from '@/lib/geo';
import { saveLastKnownLocation, getLastKnownLocation } from '@/lib/lastKnownLocation';

import { useEffect, useState } from 'react';
import { useNearbyServiceProviders } from './useServiceProviders';
import type { NearbyServiceProvidersParams } from '@/types/service.types';

const RADIUS_KM = 7 /* DEFAULT_NEARBY_RADIUS_KM — وضع غزة */;
const DISPLAY_LIMIT = 8;

type PermissionState = 'checking' | 'granted' | 'not-granted';

/**
 * Home §6/§7: silent variant of the pattern NearbyServiceProviders.tsx
 * uses on /service-providers. That component calls
 * navigator.geolocation.getCurrentPosition() directly on user action,
 * which is correct there (explicit "استخدام موقعي الحالي" button) but
 * wrong for Home — calling getCurrentPosition unconditionally on page
 * load triggers the browser's permission popup for every visitor, even
 * ones who've never granted location access.
 *
 * This hook instead checks the Permissions API first, without
 * prompting: only when the browser reports the geolocation permission
 * is already 'granted' does it call getCurrentPosition (which then
 * resolves silently, no popup, since permission already exists) and
 * feed the position into the existing useNearbyServiceProviders hook.
 * For 'prompt', 'denied', or when the Permissions API itself is
 * unsupported, this returns an inert "not available" result and the
 * caller renders nothing — no popup, no error, no skeleton stuck
 * forever (plan §6).
 */
export function useNearbyServiceProvidersIfGranted() {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // jsdom (and some older browsers) report `'permissions' in navigator`
    // as true while `navigator.permissions` itself is undefined — the
    // `'permissions' in navigator` check alone is not enough, and
    // calling `.query` on undefined used to throw and break the
    // "Permissions API unsupported" unit test.
    if (!navigator.geolocation || typeof navigator.permissions?.query !== 'function') {
      setPermission('not-granted');
      return;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;

        if (status.state !== 'granted') {
          setPermission('not-granted');
          return;
        }

        // Already granted — getCurrentPosition resolves without a
        // popup here, since permission was granted in a prior visit.
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (!isUsableNearbyCoord(lat, lng)) {
              setPermission('not-granted');
              return;
            }
            setCoords({ lat, lng });
            saveLastKnownLocation({ lat, lng, accuracy: pos.coords.accuracy });
            setPermission('granted');
          },
          () => {
            if (cancelled) return;
            setPermission('not-granted');
          },
          GEO_POSITION_OPTIONS,
        );
      })
      .catch(() => {
        if (!cancelled) setPermission('not-granted');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // أوفلاين: آخر موقع معروف إن لم يتوفر GPS حي
  const effectiveCoords =
    coords ??
    (typeof navigator !== 'undefined' && navigator.onLine === false
      ? getLastKnownLocation()?.location ?? null
      : null);

  const params: NearbyServiceProvidersParams | null =
    effectiveCoords
      ? {
          lat: effectiveCoords.lat,
          lng: effectiveCoords.lng,
          radius: RADIUS_KM,
          limit: DISPLAY_LIMIT,
        }
      : null;

  const query = useNearbyServiceProviders(params);

  /**
   * available === false means "don't render this section at all" —
   * covers 'checking' (still resolving, no flash of an empty section)
   * and 'not-granted' (prompt/denied/unsupported) alike. Callers
   * should not distinguish further; that's the whole point of §6 —
   * no error, no permission-request UI, just absence.
   */
  const offlineWithLastKnown =
    typeof navigator !== 'undefined' &&
    navigator.onLine === false &&
    Boolean(effectiveCoords);

  return {
    // أونلاين: فقط بعد إذن GPS. أوفلاين: آخر موقع معروف يكفي لعرض القسم.
    available: permission === 'granted' || offlineWithLastKnown,
    isChecking: permission === 'checking' && !offlineWithLastKnown,
    ...query,
  };
}
