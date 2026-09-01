'use client';

import { useEffect, useState } from 'react';
import { GEO_POSITION_OPTIONS, isUsableNearbyCoord } from '@/lib/geo';

/**
 * PR4C: silent, non-prompting coordinate resolver for optional
 * location-ranking signals (store recommendations' lat/lng — see
 * recommendations.api.ts's GetStoreRecommendationsParams). Same
 * "check the Permissions API first, never call
 * getCurrentPosition unless it already reports 'granted'" posture as
 * useNearbyServiceProvidersIfGranted.ts, kept as its own small hook
 * here rather than importing that one directly: that hook is coupled
 * to NearbyServiceProvidersParams/useNearbyServiceProviders and a
 * fixed radius/limit, none of which apply to a store-recommendations
 * rail. This intentionally returns bare coordinates (or null) and
 * nothing else — no permission-state plumbing the caller has to
 * thread through, since "not available" and "still checking" both
 * simply mean "the caller passes no lat/lng", never an error state.
 */
export function useSilentCoordinates(): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!navigator.geolocation || typeof navigator.permissions?.query !== 'function') {
      return;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return;

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (!isUsableNearbyCoord(lat, lng)) return;
            setCoords({ lat, lng });
          },
          () => {
            /* no-op — caller just proceeds without coordinates */
          },
          GEO_POSITION_OPTIONS
        );
      })
      .catch(() => {
        /* Permissions API unsupported/rejected — no coordinates, no error */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
