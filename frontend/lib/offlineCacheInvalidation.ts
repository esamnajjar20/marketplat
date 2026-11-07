import { reportBackgroundFailure } from './backgroundTask';
import { getActiveSW } from './swReady';
import { clearOfflineJson, OFFLINE_JSON_KEYS } from '@/lib/offlineJsonCache';
import { clearOfflineList, OFFLINE_LIST_KEYS } from '@/lib/offlineListCache';
import { clearOfflineBrowseSnapshots } from '@/lib/offlineBrowseSnapshots';
import { clearNotificationsCache } from '@/lib/notificationsCache';
import { clearVisitedProducts } from './offlineVisitedProducts';
import { clearVisitedPublicStores, clearVisitedPublicServiceListings } from './offlineVisitedPublicEntities';
import { clearVisitedAds } from './offlineVisitedAds';

const SAFE_METHODS = new Set(['get', 'head', 'options']);

import { getCacheInvalidationRule, type CacheInvalidationRule } from '@/lib/cache/cacheInvalidationRegistry';
import { canonicalPathname } from '@/lib/cache/cacheKey';

function matchingRule(pathname: string): CacheInvalidationRule | null {
  return getCacheInvalidationRule(pathname);
}

function clearLocal(slot: CacheInvalidationRule['local'][number]): void {
  switch (slot) {
    case 'ads': clearOfflineList(OFFLINE_LIST_KEYS.adsBrowse); clearOfflineList(OFFLINE_LIST_KEYS.adsGridBrowse); clearOfflineBrowseSnapshots('ads'); clearVisitedAds(); break;
    case 'myAds': clearOfflineList(OFFLINE_LIST_KEYS.myAds); break;
    case 'products': clearOfflineList(OFFLINE_LIST_KEYS.productsBrowse); clearOfflineList(OFFLINE_LIST_KEYS.productsGridBrowse); clearOfflineBrowseSnapshots('products'); clearVisitedProducts(); break;
    case 'services': clearOfflineList(OFFLINE_LIST_KEYS.servicesBrowse); clearVisitedPublicServiceListings(); break;
    case 'stores': clearOfflineList(OFFLINE_LIST_KEYS.storesBrowse); clearVisitedPublicStores(); break;
    case 'categories': clearOfflineList(OFFLINE_LIST_KEYS.categories); break;
    case 'productCategories': clearOfflineList(OFFLINE_LIST_KEYS.productCategories); break;
    case 'serviceCategories': clearOfflineList(OFFLINE_LIST_KEYS.serviceCategories); break;
    case 'activity': clearOfflineList(OFFLINE_LIST_KEYS.activity); break;
    case 'savedSearches': clearOfflineList(OFFLINE_LIST_KEYS.savedSearches); break;
    case 'appointments': clearOfflineJson(OFFLINE_JSON_KEYS.appointmentsMine); break;
    case 'profile': clearOfflineJson(OFFLINE_JSON_KEYS.userProfileSelf); break;
    case 'seller': clearOfflineJson(OFFLINE_JSON_KEYS.sellerProfileSelf); break;
    case 'storeSelf': clearOfflineJson(OFFLINE_JSON_KEYS.storeSelf); break;
    case 'providerSelf': clearOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf); break;
    case 'notifications': clearNotificationsCache(); break;
  }
}

export async function invalidateOfflineCachesForMutation(url: string, method: string): Promise<void> {
  if (SAFE_METHODS.has(method.toLowerCase())) return;
  let parsed: URL;
  try { parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost'); } catch { return; }
  const resourcePath = canonicalPathname(parsed.pathname);
  const rule = matchingRule(resourcePath);
  if (!rule) return;
  for (const slot of rule.local) clearLocal(slot);
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // A message being posted is not proof that Cache Storage was invalidated.
  // Wait for an acknowledgement emitted only after all matching entries have
  // been deleted. Bound the wait so a broken/unavailable SW cannot hang a
  // successful server mutation indefinitely; local IndexedDB invalidation has
  // already completed above.
  try {
    const deadline = Date.now() + 1_000;
    const registration = await getActiveSW(1_000);
    const worker = registration?.active ?? navigator.serviceWorker.controller;
    if (!worker) return;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error('Service Worker unavailable before cache invalidation deadline');
    }
    const channel = new MessageChannel();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        channel.port1.close();
        channel.port2.close();
        reject(new Error('Service Worker cache invalidation acknowledgement timed out'));
      }, remainingMs);
      channel.port1.onmessage = (event: MessageEvent) => {
        window.clearTimeout(timeout);
        channel.port1.close();
        if (event.data?.type === 'INVALIDATE_API_CACHE_DONE') resolve();
        else reject(new Error('Service Worker cache invalidation failed'));
      };
      worker.postMessage({
        type: 'INVALIDATE_API_CACHE',
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prefixes: rule.prefixes,
        domains: rule.domains,
      }, [channel.port2]);
    });
  } catch (error) {
    reportBackgroundFailure('frontend/lib/offlineCacheInvalidation.ts', error);
  }
}
