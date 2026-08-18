'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';

const STORAGE_KEY = 'location:gps';
const SAVED_GPS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// COMPAT-AUDIT fix: useLocationResolver() is called independently from
// four separate Home sections (HomeAboveFold, RecentProductsSection,
// FeaturedStoresSection, NearbyProvidersSection) — each is its own
// hook instance with its own useState, by design (the Phase 2 spec
// explicitly forbids adding a Zustand store or any new shared-state
// system for this). That's fine for permission-checking and city
// (city comes from the auth store, which *is* already shared), but it
// meant a GPS fix obtained via one section's "استخدام موقعي" CTA (or
// silently, if permission was already granted) never reached the other
// three sections' independent state — localStorage's own native
// `storage` event only fires for *other tabs*, never same-tab writes,
// so nothing told the other three instances to re-read it. They'd
// stay on their stale source (city/fallback) until a full page
// reload, even though a fresh, valid GPS fix already existed.
//
// This is a plain EventTarget used purely as a same-tab signal — it
// carries no data itself (every listener still independently calls
// readSavedGps()/reacts via its own useState), so it isn't a shared
// state container the way a Zustand store or Context provider would
// be; it's the same "notify other listeners a write happened"
// mechanism the native `storage` event already provides across tabs,
// just extended to also cover the same tab.
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
 * Phase 2 — hooks/useLocationResolver.ts
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
 * that's Phase 4. This hook only resolves + persists a location and
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

  // ── Check permission state (no prompt) + silently resolve if granted ─
  useEffect(() => {
    let cancelled = false;

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    if (!('permissions' in navigator) || !navigator.permissions) {
      // Permissions API unsupported: we still must not call
      // getCurrentPosition automatically (would prompt every visitor).
      // Wait for an explicit requestLocation() call instead.
      setPermission('prompt');
      return;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;

        if (status.state === 'granted') {
          setPermission('granted');
          // Already granted — resolves without a popup.
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mountedRef.current) return;
              const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
              setCurrentCoords(coords);
              persistSavedGps(coords);
            },
            () => {
              // Granted but resolution failed (e.g. hardware error) —
              // fall through to saved GPS / city / fallback below.
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
          );
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
  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    setIsRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  // ── Resolve final source per the priority chain ───────────────────
  const isLoading = permission === 'checking' || isRequesting;

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

  const trimmedCity = city?.trim();
  if (trimmedCity) {
    return {
      source: 'city',
      city: trimmedCity,
      isLoading,
      requestLocation,
    };
  }

  return {
    source: 'fallback',
    isLoading,
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
