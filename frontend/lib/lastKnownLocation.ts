import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';
/**
 * آخر موقع معروف — يُحفظ عند نجاح تحديد الموقع أونلاين،
 * ويُستخدم أوفلاين لحساب المسافات التقريبية (Nearby).
 */

import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

export interface LastKnownLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export function saveLastKnownLocation(loc: LastKnownLocation): void {
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
  const userId = getCurrentOfflineUserId();
  if (!userId) return;
  saveOfflineJson(OFFLINE_JSON_KEYS.lastKnownLocation, loc, userId);
}

export function getLastKnownLocation(): {
  location: LastKnownLocation;
  savedAt: string;
} | null {
  const env = getOfflineJson<LastKnownLocation>(OFFLINE_JSON_KEYS.lastKnownLocation, getCurrentOfflineUserId());
  if (!env?.data) return null;
  return { location: env.data, savedAt: env.savedAt };
}

/** Haversine بالكيلومتر — نفس فكرة Nearby في المشروع. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
