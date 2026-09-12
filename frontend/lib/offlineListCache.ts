/**
 * كاش قوائم محدود للأوفلاين (localStorage عبر localStore).
 * حدود ثابتة — لا نخزّن بلا سقف.
 *
 * الاستخدام: احفظ عند نجاح الشبكة، اقرأ كـ initialData / fallback عند الفشل.
 */

import { localGet, localSet, localRemove } from '@/lib/localStore';

export interface OfflineListEnvelope<T> {
  items: T[];
  savedAt: string;
}

function key(name: string): string {
  return `offline-list:${name}`;
}

export function saveOfflineList<T>(
  name: string,
  items: T[],
  maxItems: number,
): void {
  localSet(key(name), {
    items: items.slice(0, maxItems),
    savedAt: new Date().toISOString(),
  } satisfies OfflineListEnvelope<T>);
}

/** null إن لم يُحفظ شيء من قبل. */
export function getOfflineList<T>(name: string): OfflineListEnvelope<T> | null {
  const data = localGet<OfflineListEnvelope<T>>(key(name), {
    items: [],
    savedAt: '',
  });
  return data.savedAt ? data : null;
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
} as const;

export function clearAllOfflineLists(): void {
  for (const k of Object.values(OFFLINE_LIST_KEYS)) {
    clearOfflineList(k);
  }
}

/** حدود التخزين — مقصودة وصريحة. */
export const OFFLINE_LIST_LIMITS = {
  activity: 40,
  savedSearches: 20,
  sellersRanking: 30,
  adsBrowse: 24,
  myAds: 30,
} as const;
