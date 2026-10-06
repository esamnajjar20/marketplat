'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { GEO_POSITION_OPTIONS, isUsableNearbyCoord } from '@/lib/geo';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { getNativeCoordinates } from '@/lib/capacitor/nativeGeolocation';
import { FEATURES } from '@/lib/featureFlags';

// SW-CLEAR-GPS-ON-LOGOUT-01: exported so authCleanup and any future
// consumer can reference the same key without duplicating the string.
export const LOCATION_STORAGE_KEY = 'location:gps';
const STORAGE_KEY = LOCATION_STORAGE_KEY;
const SAVED_GPS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// COMPAT-AUDIT: useLocationResolver is still used by the standalone
// service-providers directory. The EventTarget below synchronizes
// saved GPS updates between independent hook instances in the same
// tab, while localStorage's native `storage` event handles other tabs.
// It carries no location data and is not a shared application state
// store.
const gpsUpdateBus = typeof window !== 'undefined' ? new EventTarget() : null;
const GPS_UPDATED_EVENT = 'location-resolver:gps-updated';

export type LocationSource = 'gps-current' | 'gps-saved' | 'city' | 'fallback';

export interface ResolvedLocation {
  source: LocationSource;
  latitude?: number;
  longitude?: number;
  city?: string;
  isLoading: boolean;
  requestLocation: () => void;
}

type PermissionState = 'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported';

interface SavedGps {
  latitude: number;
  longitude: number;
  timestamp: number;
}

/**
 * hooks/useLocationResolver.ts
 *
 * Single abstraction responsible for *resolving* a best-effort location
 * for Home, in priority order:
 *   1. gps-current — a fresh position obtained this session (either
 *      silently, because the Permissions API already reports 'granted',
 *      or because the user pressed the "استخدام موقعي" CTA).
 *   2. gps-saved   — a previously-saved position still inside its TTL.
 *   3. city        — user.city from the auth store.
 *   4. fallback    — nothing usable; callers show general/varied content.
 *
 * Deliberately not wired to Products/Stores/Ads/ServiceProviders here —
 * that's This hook only resolves + persists a location and
 * exposes it; nothing here talks to any of the section components or
 * their query hooks.
 *
 * Mirrors the existing useNearbyServiceProvidersIfGranted permission-check
 * pattern (query navigator.permissions before ever calling
 * getCurrentPosition) but generalizes it into a resolver with saved-GPS
 * and city fallbacks, and an explicit requestLocation() escape hatch for
 * the 'prompt' state, since that hook intentionally never prompts at all.
 *
 * Does NOT touch or replace useNearbyServiceProvidersIfGranted or
 * /service-providers/nearby — those stay exactly as they are.
 */
export function useLocationResolver(): ResolvedLocation {
  const city = useAuthStore((s) => s.user?.city ?? null);

  const [permission, setPermission] = useState<PermissionState>('checking');
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [savedGps, setSavedGps] = useState<SavedGps | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Guards against setting state after unmount from an in-flight
  // getCurrentPosition callback (same pattern as the sibling hook).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Load any valid saved GPS from localStorage on mount, and again
  // whenever a sibling useLocationResolver() instance elsewhere on the
  // page (e.g. the CTA in HomeAboveFold) persists a fresh fix — see
  // gpsUpdateBus's own comment above for why this is needed at all. ─
  useEffect(() => {
    setSavedGps(readSavedGps());

    if (!gpsUpdateBus) return;
    const onGpsUpdated = () => setSavedGps(readSavedGps());
    gpsUpdateBus.addEventListener(GPS_UPDATED_EVENT, onGpsUpdated);
    return () => gpsUpdateBus.removeEventListener(GPS_UPDATED_EVENT, onGpsUpdated);
  }, []);

  // ── لا نجلب GPS تلقائيًا — المدينة هي المصدر الأساسي ───────────────
  useEffect(() => {
    let cancelled = false;

    // FEATURE-FLAG-GPS: when GPS is disabled, leave permission at
    // 'unsupported' so nothing downstream thinks a grant is possible.
    if (!FEATURES.GPS_LOCATION) {
      setPermission('unsupported');
      return;
    }

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    // لا نستدعي getCurrentPosition أبدًا عند التحميل — حتى لو كان الإذن ممنوحًا
    setPermission('prompt');

    if (!('permissions' in navigator) || !navigator.permissions) {
      return;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;

        if (status.state === 'granted') {
          setPermission('granted');
          // تعمدًا: لا نجلب الإحداثيات تلقائيًا
        } else if (status.state === 'denied') {
          setPermission('denied');
        } else {
          setPermission('prompt');
        }
      })
      .catch(() => {
        if (!cancelled) setPermission('prompt');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Explicit user action: "📍 استخدام موقعي" ──────────────────────
  // Wiring native GPS (Capacitor shell): this is the one call site in
  // this hook where prompting is already the intended behavior (the
  // user just tapped the CTA), so it's the correct place to offer the
  // native permission dialog — unlike the silent auto-check effect
  // above, which must stay non-prompting and is deliberately left on
  // navigator.geolocation only. On web this branch's isNativePlatform()
  // check resolves false and falls straight through to the existing
  // navigator.geolocation path, unchanged.
  const requestLocation = useCallback(() => {
    // FEATURE-FLAG-GPS: no-op when GPS is disabled. Callers that still
    // render a CTA (they shouldn't — see each section's own guard)
    // would find the button does nothing, which is the honest UX.
    if (!FEATURES.GPS_LOCATION) return;

    if (typeof window === 'undefined') {
      setPermission('unsupported');
      return;
    }

    setIsRequesting(true);

    isNativePlatform().then((native) => {
      if (!mountedRef.current) return;

      if (native) {
        getNativeCoordinates()
          .then((coords) => {
            if (!mountedRef.current) return;
            if (!coords || !isUsableNearbyCoord(coords.latitude, coords.longitude)) {
              setIsRequesting(false);
              setPermission((prev) => (prev === 'checking' ? 'prompt' : prev));
              return;
            }
            const resolved = { latitude: coords.latitude, longitude: coords.longitude };
            setCurrentCoords(resolved);
            setPermission('granted');
            setIsRequesting(false);
            persistSavedGps(resolved);
          })
          .catch(() => {
            if (!mountedRef.current) return;
            setIsRequesting(false);
            setPermission((prev) => (prev === 'checking' ? 'prompt' : prev));
          });
        return;
      }

      if (!('geolocation' in navigator)) {
        setIsRequesting(false);
        setPermission('unsupported');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mountedRef.current) return;
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          if (!isUsableNearbyCoord(coords.latitude, coords.longitude)) {
            setIsRequesting(false);
            setPermission((prev) => (prev === 'checking' ? 'prompt' : prev));
            return;
          }
          setCurrentCoords(coords);
          setPermission('granted');
          setIsRequesting(false);
          persistSavedGps(coords);
        },
        () => {
          if (!mountedRef.current) return;
          // Failure must not break Home — just stop requesting and let
          // the resolver fall through to saved GPS / city / fallback.
          setIsRequesting(false);
          setPermission((prev) => (prev === 'checking' ? 'prompt' : prev));
        },
        GEO_POSITION_OPTIONS,
      );
    });
  }, []);

  // ── Resolve final source — المدينة أولوية (بدون اعتماد على GPS) ───
  //
  // FEATURE-FLAG-GPS: when disabled, skip GPS branches entirely. The
  // hooks above are still called (Rules of Hooks), but neither
  // gps-current nor gps-saved can be the resolved source anymore.
  if (!FEATURES.GPS_LOCATION) {
    const earlyCity = city?.trim();
    if (earlyCity) {
      return { source: 'city', city: earlyCity, isLoading: false, requestLocation };
    }
    return { source: 'fallback', isLoading: false, requestLocation };
  }

  const isLoading = permission === 'checking' || isRequesting;

  const trimmedCity = city?.trim();
  if (trimmedCity) {
    return {
      source: 'city',
      city: trimmedCity,
      isLoading: false,
      requestLocation,
    };
  }

  // لا نستخدم GPS كمصدر افتراضي — فقط عند طلب صريح (معطّل من الواجهة)
  if (currentCoords) {
    return {
      source: 'gps-current',
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
      isLoading,
      requestLocation,
    };
  }

  if (savedGps) {
    return {
      source: 'gps-saved',
      latitude: savedGps.latitude,
      longitude: savedGps.longitude,
      isLoading,
      requestLocation,
    };
  }

  return {
    source: 'fallback',
    isLoading: false,
    requestLocation,
  };
}

// ── localStorage helpers ────────────────────────────────────────────

function readSavedGps(): SavedGps | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGps>;
    if (
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.timestamp > SAVED_GPS_TTL_MS) {
      return null;
    }
    if (!isUsableNearbyCoord(parsed.latitude, parsed.longitude)) {
      return null;
    }
    return { latitude: parsed.latitude, longitude: parsed.longitude, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

function persistSavedGps(coords: { latitude: number; longitude: number }): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedGps = { ...coords, timestamp: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    gpsUpdateBus?.dispatchEvent(new Event(GPS_UPDATED_EVENT));
  } catch {
    // Storage full or unavailable (private browsing) — non-fatal;
    // the resolved coords still work for this session via state.
  }
}
