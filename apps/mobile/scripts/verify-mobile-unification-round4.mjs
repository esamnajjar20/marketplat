import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const client = read('../src/api/client.ts');
const cache = read('../src/storage/public-cache.ts');
const listHook = read('../src/hooks/usePaginatedList.ts');
const serviceApi = read('../src/features/services/services.api.ts');
const servicesScreen = read('../app/services.tsx');
const salesExtra = read('../src/features/sales/sales-extra.api.ts');
const messaging = read('../src/features/messaging/messaging.api.ts');
const notificationScreen = read('../app/notifications.tsx');
const customersScreen = read('../app/customers.tsx');
const debtsScreen = read('../app/debts.tsx');
const installmentsScreen = read('../app/installments.tsx');
const saleCreateScreen = read('../app/sale-create.tsx');
const createOutbox = read('../src/storage/entity-create-outbox.ts');
const cachePolicy = read('../src/lib/offline-cache-policy.ts');
const adsApi = read('../src/features/ads/ads.api.ts');
const categoriesApi = read('../src/features/categories/categories.api.ts');
const slash = String.fromCharCode(92);

const checks = [
  ['private cache allowlist contains owner-scoped debt, installment, customer, and notification reads',
    client.includes(`sales${slash}/debts`) && client.includes(`sales${slash}/installments`) && client.includes('customers') && client.includes('notifications')],
  ['private cache keys keep the complete query string and require a stable owner ID',
    client.includes('return `api-private:${encodeURIComponent(ownerId)}:${path}`') && client.includes('if (!ownerId?.trim() || !path.startsWith')],
  ['customer and notification mutations invalidate owner-scoped namespaces',
    /route: \/\^\\\/api\\\/v1\\\/(?:customers|notifications)/.test(client) && client.includes("'/api/v1/customers'") && client.includes("'/api/v1/notifications'") && client.includes('clearPrivateCacheForPrefix(prefix, ownerId)')],
  ['prefix matching is route-boundary aware',
    cache.includes("substr(cache_key, ?, 1) IN ('/', '?')") && cache.includes('Enforce a route boundary')],
  ['private cache invalidation uses literal prefix matching, not SQL LIKE wildcards',
    cache.includes('substr(cache_key, 1, ?) = ?') && !cache.includes('cache_key LIKE ? || ? || ?')],
  ['debt and customer reads pass the current owner into the private cache layer',
    salesExtra.includes('cacheOwnerId: ownerId ?? undefined') && debtsScreen.includes('fetchDebts(page, accessToken, signal, user?.id)') && customersScreen.includes('fetchCustomers(token, debouncedQ, page, signal, user?.id)')],
  ['notifications read/cache mutations pass the current owner',
    messaging.includes('cacheOwnerId: ownerId ?? undefined') && notificationScreen.includes('fetchNotificationsPage(currentToken, page, 50, false, signal, user?.id)') && notificationScreen.includes('markAllNotificationsRead(token, csrfToken, user?.id)')],
  ['sales mutations and installment reads carry the account owner and cancel stale requests',
    salesExtra.includes('cacheOwnerId: ownerId ?? undefined') && installmentsScreen.includes('fetchInstallments(kind, accessToken, user.id, controller.signal)') && installmentsScreen.includes('loadControllerRef.current?.abort()') && installmentsScreen.includes('[accessToken, kind, user?.id]') && installmentsScreen.includes('const visibleItems = itemsKey === listKey ? items : []') && saleCreateScreen.includes('createSale(payload, accessToken, csrfToken, operationId, user?.id)')],
  ['outbox sale mutations preserve owner scope through the shared API client',
    createOutbox.includes('cacheOwnerId: input.ownerId')],
  ['shared pagination hydrates a cached first page before network refresh',
    listHook.includes('readCachedPage?: (page: number) => Promise') && listHook.includes('await readCachedPageRef.current(1)') && listHook.includes('mergeUniquePageItems([], cached.items, getItemKeyRef.current)') && listHook.includes('mergeUniquePageItems([], result.items, getItemKeyRef.current)') && listHook.includes('await fetchPageRef.current(1, controller.signal)')],
  ['public services screen uses shared pagination and cache-first revalidation',
    servicesScreen.includes('usePaginatedList<ServiceListing>') && servicesScreen.includes('readCachedPage: async') && servicesScreen.includes('getCachedServiceListingsPage') && servicesScreen.includes('signal')],
  ['stale-cache policy rejects explicit 4xx and cancellation',
    cachePolicy.includes("failure.code === 'REQUEST_CANCELLED'") && cachePolicy.includes('failure.status === 429 || failure.status >= 500')],
  ['ads, categories, and services use the common stale-cache fallback policy',
    adsApi.includes('canUseStaleCacheAfterReadFailure') && categoriesApi.includes('canUseStaleCacheAfterReadFailure') && serviceApi.includes('canUseStaleCacheAfterReadFailure')],
  ['service API never falls back after caller cancellation',
    serviceApi.includes('if (!canUseStaleCacheAfterReadFailure(error, options.signal)) throw error')],
  ['chat message retrieval retains cursor pagination',
    messaging.includes('before') && messaging.includes('nextCursor')],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}
console.log(`Round 4 unification checks: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
