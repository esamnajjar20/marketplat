/**
 * كاش كائنات JSON محدودة للأوفلاين (localStorage).
 * للداشبورد / المواعيد / آخر موقع / نتائج قريبة — ليس مصدر حقيقة.
 */

import { localGet, localSet, localRemove } from '@/lib/localStore';

export interface OfflineJsonEnvelope<T> {
  data: T;
  savedAt: string;
  /**
   * T770 — owner of this entry. Several consumers of this cache store
   * per-user data (userProfileSelf, sellerProfileSelf, storeSelf,
   * serviceProviderSelf, dashboardAttention, appointmentsMine) without
   * any identity marker, so on a shared device a crash-without-logout
   * followed by a different user signing in showed the previous user's
   * profile/attention/appointments from this cache as initialData
   * (before the new user's own /me response landed). T682 covers the
   * common clean-logout path, but not a force-close — this field makes
   * the read refuse to serve a different user regardless of how the
   * previous session ended. null for callers that don't pass one (all
   * public/global caches) — those entries stay readable to anyone.
   */
  userId?: string | null;
}

function key(name: string): string {
  return `offline-json:${name}`;
}

export function saveOfflineJson<T>(
  name: string,
  data: T,
  userId?: string | null,
): void {
  localSet(key(name), {
    data,
    savedAt: new Date().toISOString(),
    userId: userId ?? null,
  } satisfies OfflineJsonEnvelope<T>);
}

export function getOfflineJson<T>(
  name: string,
  userId?: string | null,
): OfflineJsonEnvelope<T> | null {
  const env = localGet<OfflineJsonEnvelope<T>>(key(name), {
    data: null as T,
    savedAt: '',
  });
  if (!env.savedAt) return null;
  // T770 — refuse to serve another user's entry. Only enforced when
  // the caller supplies a userId; callers that pass nothing keep the
  // pre-T770 behavior (read whatever's there), which is correct for
  // genuinely global slots.
  if (userId !== undefined && (env.userId ?? null) !== (userId ?? null)) {
    return null;
  }
  return env;
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

/** @deprecated use formatOfflineSavedAt from @/lib/offlineFreshness */
export { formatOfflineSavedAt } from '@/lib/offlineFreshness';
