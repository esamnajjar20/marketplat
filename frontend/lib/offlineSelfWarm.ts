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
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';
import { productCategoriesApi } from '@/api/product-categories.api';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { getNetworkPolicy } from '@/lib/networkPolicy';
import { getWarmingMode } from '@/lib/warmingPreferences';
import { CACHE_TTL } from '@/lib/constants';
import {
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

const inFlightByUser = new Map<string, Promise<void>>();

function hasFreshQueryData(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  staleTimeMs: number,
): boolean {
  const state = queryClient.getQueryState(queryKey);
  return Boolean(
    state &&
    state.data !== undefined &&
    Date.now() - state.dataUpdatedAt < staleTimeMs,
  );
}

export async function warmSelfDataForOffline(
  queryClient: QueryClient,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId || typeof window === 'undefined') return;
  // Background warming is optional. Respect explicit user preference and
  // the shared network policy before starting any requests.
  if (getWarmingMode() === 'off' || !getNetworkPolicy().allowBackgroundWarming) return;

  const existing = inFlightByUser.get(userId);
  if (existing) return existing;

  const run = Promise.allSettled([
    (async () => {
      const queryKey = queryKeys.sellers.me();
      const cached = queryClient.getQueryData(queryKey);
      if (
        cached !== undefined &&
        hasFreshQueryData(queryClient, queryKey, CACHE_TTL.sellerProfile) &&
        getCurrentOfflineUserId() === userId
      ) {
        if (cached) saveOfflineJson(OFFLINE_JSON_KEYS.sellerProfileSelf, cached, userId);
        return;
      }
      const data = await sellersApi.getMyProfile().then((r) => r.data.data);
      if (!data || getCurrentOfflineUserId() !== userId) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.sellerProfileSelf, data, userId);
      queryClient.setQueryData(queryKeys.sellers.me(), data);
    })(),
    (async () => {
      const queryKey = queryKeys.stores.me();
      const cached = queryClient.getQueryData(queryKey);
      if (
        cached !== undefined &&
        hasFreshQueryData(queryClient, queryKey, CACHE_TTL.sellerProfile) &&
        getCurrentOfflineUserId() === userId
      ) {
        if (cached) saveOfflineJson(OFFLINE_JSON_KEYS.storeSelf, cached, userId);
        return;
      }
      const data = await storesApi.getMyStore().then((r) => r.data.data);
      if (!data || getCurrentOfflineUserId() !== userId) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.storeSelf, data, userId);
      queryClient.setQueryData(queryKeys.stores.me(), data);
    })(),
    (async () => {
      const queryKey = queryKeys.serviceProviders.me();
      const cached = queryClient.getQueryData(queryKey);
      if (
        cached !== undefined &&
        hasFreshQueryData(queryClient, queryKey, CACHE_TTL.sellerProfile) &&
        getCurrentOfflineUserId() === userId
      ) {
        if (cached) saveOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf, cached, userId);
        return;
      }
      const data = await serviceProvidersApi.getMyProvider().then((r) => r.data.data);
      if (!data || getCurrentOfflineUserId() !== userId) return;
      saveOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf, data, userId);
      queryClient.setQueryData(queryKeys.serviceProviders.me(), data);
    })(),
    // FIX CATEGORIES-OFFLINE-01: category trees are needed for EVERY
    // create form (ad / product / service / request), regardless of
    // which "self" profile the user has. Warming them here means the
    // <select> is populated on the very first offline visit instead of
    // rendering empty and blocking submit. Best-effort like the three
    // above — a failure here just falls back to live fetch later.
    (async () => {
      const queryKey = queryKeys.productCategories.all();
      const cached = queryClient.getQueryData<unknown[]>(queryKey);
      if (
        Array.isArray(cached) &&
        hasFreshQueryData(queryClient, queryKey, CACHE_TTL.categories)
      ) {
        saveOfflineList(
          OFFLINE_LIST_KEYS.productCategories,
          cached,
          OFFLINE_LIST_LIMITS.productCategories,
        );
        return;
      }
      const data = await productCategoriesApi.getAll().then((r) => r.data.data);
      if (!Array.isArray(data) || data.length === 0 || getCurrentOfflineUserId() !== userId) return;
      saveOfflineList(
        OFFLINE_LIST_KEYS.productCategories,
        data as unknown[],
        OFFLINE_LIST_LIMITS.productCategories,
      );
      queryClient.setQueryData(queryKeys.productCategories.all(), data);
    })(),
    (async () => {
      const queryKey = queryKeys.serviceCategories.all();
      const cached = queryClient.getQueryData<unknown[]>(queryKey);
      if (
        Array.isArray(cached) &&
        hasFreshQueryData(queryClient, queryKey, CACHE_TTL.categories)
      ) {
        saveOfflineList(
          OFFLINE_LIST_KEYS.serviceCategories,
          cached,
          OFFLINE_LIST_LIMITS.serviceCategories,
        );
        return;
      }
      const data = await serviceCategoriesApi.getAll().then((r) => r.data.data);
      if (!Array.isArray(data) || data.length === 0 || getCurrentOfflineUserId() !== userId) return;
      saveOfflineList(
        OFFLINE_LIST_KEYS.serviceCategories,
        data as unknown[],
        OFFLINE_LIST_LIMITS.serviceCategories,
      );
      queryClient.setQueryData(queryKeys.serviceCategories.all(), data);
    })(),
  ]).then(() => undefined).finally(() => {
    if (inFlightByUser.get(userId) === run) inFlightByUser.delete(userId);
  });
  inFlightByUser.set(userId, run);
  return run;
}
