/**
 * Prefetch this user's own "self" profiles (seller / store /
 * service-provider) after a successful login or session restore.
 *
 * Why this exists:
 *   The three create pages /ads/create, /my-store/products/new, and
 *   /my-services/new are warmed offline as HTML by
 *   lib/offlineRouteShells.ts's warmPersonalShells — but warming is a
 *   plain fetch(), so it doesn't run React, and the "do I already have
 *   this profile?" queries those gates depend on never fire. The gates
 *   (CreateAdGate, RequireProfileGate's callers) each read
 *   offlineJsonCache for their offline fallback, so without the user
 *   having visited /dashboard (DashboardStats fires useMySellerProfile
 *   + useMyServiceProvider) or /my-store (Sidebar fires useMyStore)
 *   once already in the session, the cache is empty and the user is
 *   told "create a profile first" even though they already have one.
 *
 * What this does:
 *   Fires the three GET-mine calls in parallel, best-effort:
 *     - 200 with data  → save into offlineJsonCache (feeds the gates'
 *                        offline fallback) AND seed React Query (so
 *                        the moment the gate mounts and calls
 *                        useMyStore/useMySellerProfile/etc., it's an
 *                        immediate hit — no loading flash).
 *     - 404 (user genuinely has no profile yet) → skip; the gate's
 *                        own "create it" CTA is the correct state
 *                        and stays unchanged.
 *     - Any other failure (network, 5xx) → skip; existing hooks'
 *                        own network-error fallbacks still work if
 *                        the user later visits the page.
 *
 * Never throws, never blocks the login / hydration flow that calls it.
 */
import type { QueryClient } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { storesApi } from '@/api/stores.api';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { saveOfflineJson, OFFLINE_JSON_KEYS } from '@/lib/offlineJsonCache';
import { productCategoriesApi } from '@/api/product-categories.api';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import {
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

export async function warmSelfDataForOffline(queryClient: QueryClient): Promise<void> {
  await Promise.allSettled([
    (async () => {
      const data = await sellersApi.getMyProfile().then((r) => r.data.data);
      if (!data) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.sellerProfileSelf, data);
      queryClient.setQueryData(queryKeys.sellers.me(), data);
    })(),
    (async () => {
      const data = await storesApi.getMyStore().then((r) => r.data.data);
      if (!data) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.storeSelf, data);
      queryClient.setQueryData(queryKeys.stores.me(), data);
    })(),
    (async () => {
      const data = await serviceProvidersApi.getMyProvider().then((r) => r.data.data);
      if (!data) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf, data);
      queryClient.setQueryData(queryKeys.serviceProviders.me(), data);
    })(),
    // FIX CATEGORIES-OFFLINE-01: category trees are needed for EVERY
    // create form (ad / product / service / request), regardless of
    // which "self" profile the user has. Warming them here means the
    // <select> is populated on the very first offline visit instead of
    // rendering empty and blocking submit. Best-effort like the three
    // above — a failure here just falls back to live fetch later.
    (async () => {
      const data = await productCategoriesApi.getAll().then((r) => r.data.data);
      if (!Array.isArray(data) || data.length === 0) return;
      saveOfflineList(
        OFFLINE_LIST_KEYS.productCategories,
        data as unknown[],
        OFFLINE_LIST_LIMITS.productCategories,
      );
      queryClient.setQueryData(queryKeys.productCategories.all(), data);
    })(),
    (async () => {
      const data = await serviceCategoriesApi.getAll().then((r) => r.data.data);
      if (!Array.isArray(data) || data.length === 0) return;
      saveOfflineList(
        OFFLINE_LIST_KEYS.serviceCategories,
        data as unknown[],
        OFFLINE_LIST_LIMITS.serviceCategories,
      );
      queryClient.setQueryData(queryKeys.serviceCategories.all(), data);
    })(),
  ]);
}
