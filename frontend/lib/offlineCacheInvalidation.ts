import { clearOfflineJson, OFFLINE_JSON_KEYS } from '@/lib/offlineJsonCache';
import { clearOfflineList, OFFLINE_LIST_KEYS } from '@/lib/offlineListCache';
import { clearNotificationsCache } from '@/lib/notificationsCache';

const SAFE_METHODS = new Set(['get', 'head', 'options']);

type InvalidationRule = {
  prefixes: string[];
  local: Array<'ads' | 'products' | 'services' | 'stores' | 'categories' | 'productCategories' | 'serviceCategories' | 'activity' | 'savedSearches' | 'myAds' | 'appointments' | 'profile' | 'seller' | 'storeSelf' | 'providerSelf' | 'notifications'>;
};

const RULES: InvalidationRule[] = [
  { prefixes: ['/ads', '/favorites'], local: ['ads', 'myAds'] },
  { prefixes: ['/products', '/promotions', '/collections'], local: ['products'] },
  { prefixes: ['/service-listings', '/service-providers'], local: ['services', 'providerSelf'] },
  { prefixes: ['/stores', '/store-types'], local: ['stores', 'storeSelf'] },
  { prefixes: ['/categories'], local: ['categories'] },
  { prefixes: ['/product-categories'], local: ['productCategories'] },
  { prefixes: ['/service-categories', '/service-types'], local: ['serviceCategories'] },
  { prefixes: ['/activity'], local: ['activity'] },
  { prefixes: ['/saved-searches'], local: ['savedSearches'] },
  { prefixes: ['/appointments'], local: ['appointments'] },
  { prefixes: ['/users/me'], local: ['profile'] },
  { prefixes: ['/sellers/me'], local: ['seller'] },
  { prefixes: ['/notifications'], local: ['notifications'] },
];

function matchingRule(pathname: string): InvalidationRule | null {
  return RULES.find((rule) => rule.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`))) ?? null;
}

function clearLocal(slot: InvalidationRule['local'][number]): void {
  switch (slot) {
    case 'ads': clearOfflineList(OFFLINE_LIST_KEYS.adsBrowse); break;
    case 'myAds': clearOfflineList(OFFLINE_LIST_KEYS.myAds); break;
    case 'products': clearOfflineList(OFFLINE_LIST_KEYS.productsBrowse); break;
    case 'services': clearOfflineList(OFFLINE_LIST_KEYS.servicesBrowse); break;
    case 'stores': clearOfflineList(OFFLINE_LIST_KEYS.storesBrowse); break;
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

export function invalidateOfflineCachesForMutation(url: string, method: string): void {
  if (SAFE_METHODS.has(method.toLowerCase())) return;
  let parsed: URL;
  try { parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost'); } catch { return; }
  const resourcePath = parsed.pathname.replace(/^\/api\/v\d+/, '') || parsed.pathname;
  const rule = matchingRule(resourcePath);
  if (!rule) return;
  for (const slot of rule.local) clearLocal(slot);
  if (typeof window !== 'undefined' && navigator.serviceWorker) {
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({
        type: 'INVALIDATE_API_CACHE',
        prefixes: rule.prefixes,
      });
    }).catch(() => {});
  }
}
