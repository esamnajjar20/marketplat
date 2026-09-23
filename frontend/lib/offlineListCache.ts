/**
 * كاش قوائم محدود للأوفلاين (localStorage عبر localStore).
 * حدود ثابتة — لا نخزّن بلا سقف.
 *
 * الاستخدام: احفظ عند نجاح الشبكة، اقرأ كـ initialData / fallback عند الفشل.
 */

import { localGet, localSet, localRemove } from '@/lib/localStore';
import { OFFLINE_DATA_LIMITS } from '@/lib/offlineCachePolicy';

export interface OfflineListEnvelope<T> {
  items: T[];
  savedAt: string;
  /** T770 — see OfflineJsonEnvelope.userId's comment for the full
   * rationale. Used by owner-scoped list slots (myAds, activity,
   * savedSearches) to refuse serving a different user's data on a
   * shared device after a crash-without-logout. */
  userId?: string | null;
}

function key(name: string): string {
  return `offline-list:${name}`;
}

export function saveOfflineList<T>(
  name: string,
  items: T[],
  maxItems: number,
  userId?: string | null,
): void {
  localSet(key(name), {
    items: items.slice(0, maxItems),
    savedAt: new Date().toISOString(),
    userId: userId ?? null,
  } satisfies OfflineListEnvelope<T>);
}

/** null إن لم يُحفظ شيء من قبل، أو كان محفوظًا لمستخدم آخر. */
export function getOfflineList<T>(
  name: string,
  userId?: string | null,
): OfflineListEnvelope<T> | null {
  const data = localGet<OfflineListEnvelope<T>>(key(name), {
    items: [],
    savedAt: '',
  });
  if (!data.savedAt) return null;
  // T770 — same refusal logic as getOfflineJson above.
  if (userId !== undefined && (data.userId ?? null) !== (userId ?? null)) {
    return null;
  }
  return data;
}

export function clearOfflineList(name: string): void {
  localRemove(key(name));
}

/** مفاتيح معروفة — للمسح عند تسجيل الخروج. */
export const OFFLINE_LIST_KEYS = {
  activity: 'activity',
  savedSearches: 'saved-searches',
  sellersRanking: 'sellers-ranking',
  adsBrowse: 'ads-browse',
  myAds: 'my-ads',
  productsBrowse: 'products-browse',
  servicesBrowse: 'services-browse',
  storesBrowse: 'stores-browse',
  categories: 'categories',
  // FIX CATEGORIES-OFFLINE-01: product + service category trees were
  // fetched live and never cached — offline, both create-product and
  // create-service forms rendered an empty <select>, so the user saw
  // "اختر الفئة" with no options to pick. Cache them like the
  // general categories tree already is.
  productCategories: 'product-categories',
  serviceCategories: 'service-categories',
} as const;

export function clearAllOfflineLists(): void {
  for (const k of Object.values(OFFLINE_LIST_KEYS)) {
    clearOfflineList(k);
  }
}

/** حدود التخزين — من offlineCachePolicy (مصدر واحد للمشروع). */
export const OFFLINE_LIST_LIMITS = {
  activity: OFFLINE_DATA_LIMITS.activity,
  savedSearches: OFFLINE_DATA_LIMITS.savedSearches,
  sellersRanking: OFFLINE_DATA_LIMITS.sellersRanking,
  adsBrowse: OFFLINE_DATA_LIMITS.adsBrowse,
  myAds: OFFLINE_DATA_LIMITS.myAds,
  productsBrowse: OFFLINE_DATA_LIMITS.productsBrowse,
  servicesBrowse: OFFLINE_DATA_LIMITS.servicesBrowse,
  storesBrowse: OFFLINE_DATA_LIMITS.storesBrowse,
  categories: OFFLINE_DATA_LIMITS.categories,
  productCategories: OFFLINE_DATA_LIMITS.categories,
  serviceCategories: OFFLINE_DATA_LIMITS.categories,
} as const;
