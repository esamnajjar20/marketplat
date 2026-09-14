/**
 * كاش كائنات JSON محدودة للأوفلاين (localStorage).
 * للداشبورد / المواعيد / آخر موقع / نتائج قريبة — ليس مصدر حقيقة.
 */

import { localGet, localSet, localRemove } from '@/lib/localStore';

export interface OfflineJsonEnvelope<T> {
  data: T;
  savedAt: string;
}

function key(name: string): string {
  return `offline-json:${name}`;
}

export function saveOfflineJson<T>(name: string, data: T): void {
  localSet(key(name), {
    data,
    savedAt: new Date().toISOString(),
  } satisfies OfflineJsonEnvelope<T>);
}

export function getOfflineJson<T>(name: string): OfflineJsonEnvelope<T> | null {
  const env = localGet<OfflineJsonEnvelope<T>>(key(name), {
    data: null as T,
    savedAt: '',
  });
  return env.savedAt ? env : null;
}

export function clearOfflineJson(name: string): void {
  localRemove(key(name));
}

export const OFFLINE_JSON_KEYS = {
  dashboardAttention: 'dashboard-attention',
  appointmentsMine: 'appointments-mine',
  lastKnownLocation: 'last-known-location',
  nearbyProviders: 'nearby-providers',
  userProfileSelf: 'user-profile-self',
  // FIX OFFLINE-SELLER-GATE-01: "do I already have this profile?" checks
  // for the three creation gates (CreateAdGate/CreateProductGate/
  // CreateServiceListingGate) — see useMySellerProfile/useMyStore/
  // useMyServiceProvider for why these needed the same offline-fallback
  // treatment useMyAttention already had.
  sellerProfileSelf: 'seller-profile-self',
  storeSelf: 'store-self',
  serviceProviderSelf: 'service-provider-self',
} as const;

export function clearAllOfflineJson(): void {
  for (const k of Object.values(OFFLINE_JSON_KEYS)) {
    clearOfflineJson(k);
  }
}

/** نص «آخر تحديث» للواجهات. */
export function formatOfflineSavedAt(savedAt: string): string {
  if (!savedAt) return '';
  try {
    const ms = Date.now() - new Date(savedAt).getTime();
    const mins = Math.max(0, Math.floor(ms / 60_000));
    if (mins < 1) return 'آخر تحديث: الآن تقريبًا';
    if (mins < 60) return `آخر تحديث: منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `آخر تحديث: منذ ${hours} ساعة`;
    return `آخر تحديث: ${new Date(savedAt).toLocaleString('ar')}`;
  } catch {
    return '';
  }
}
