import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const productPage = read('app/(public)/products/[id]/page.tsx');
const productSection = read('components/stores/ProductDetailSection.tsx');
const productHook = read('hooks/queries/useProducts.ts');
const requestLayout = read('app/(public)/requests/[id]/layout.tsx');
const requestPage = read('app/(public)/requests/[id]/page.tsx');
const requestHook = read('hooks/queries/useRequests.ts');
const storePage = read('app/(public)/stores/[id]/page.tsx');
const storeProducts = read('components/stores/StoreProducts.tsx');
const storeShell = read('components/stores/StoreStorefront.tsx');
const storeSnapshot = read('components/stores/StoreVisitSnapshot.tsx');
const storeHook = read('hooks/queries/useStores.ts');
const storeFallback = read('components/stores/StoreDetailClient.tsx');
const servicePage = read('app/(public)/services/[id]/page.tsx');
const adPage = read('app/(public)/ads/[id]/page.tsx');
const adPrefetch = read('lib/prefetch.ts');
const profilePage = read('app/(public)/profile/[id]/page.tsx');
const requestTest = read('__tests__/unit/hooks/useRequests.test.tsx');
const productTest = read('__tests__/unit/hooks/useProducts.test.tsx');
const storesTest = read('__tests__/unit/hooks/useStores.test.tsx');
const storeSnapshotTest = read('__tests__/components/StoreVisitSnapshot.test.tsx');
const authCleanup = read('lib/authCleanup.ts');
const serverApiAdapter = read('lib/serverApiAdapter.ts');
const requestService = fs.readFileSync(path.resolve(root, '../apps/api/src/modules/requests/requests.service.ts'), 'utf8');

const checks = [
  ['Product detail seeds the exact useProduct query key on the server', /setQueryData\(queryKeys\.products\.detail\(id\), product\)/.test(productPage)],
  ['Product SSR hydration only seeds the query after a successful server fetch', /if \(product\) \{[\s\S]*?setQueryData\(queryKeys\.products\.detail\(id\), product\)/.test(productPage)],
  ['Product detail sends dehydrated query state through HydrationBoundary', /HydrationBoundary state=\{dehydrate\(queryClient\)\}/.test(productPage)],
  ['Product detail component consumes the shared product detail query', /useProduct\(id\)/.test(productSection)],
  ['Hydrated product data is persisted to offline snapshots from the hook effect', /useEffect\(\(\) => \{[\s\S]*?!query\.isFetchedAfterMount/.test(productHook) && /saveVisitedProduct\(product\)/.test(productHook)],
  ['Product hook keeps offline visited-product fallback on transient errors', /getVisitedProduct\(id\)/.test(productHook) && /status === 404/.test(productHook)],
  ['Request layout memoizes the public read across metadata and layout', /const getCachedRequest = cache\(/.test(requestLayout)],
  ['Request layout hydrates the exact request detail key', /setQueryData\(queryKeys\.requests\.detail\(id\), request\)/.test(requestLayout)],
  ['Request layout wraps the client route with HydrationBoundary', /HydrationBoundary state=\{dehydrate\(queryClient\)\}/.test(requestLayout)],
  ['Request SSR is explicitly documented as anonymous and privacy-safe', /anonymous-safe request read/.test(requestLayout) && /permission-scoped/.test(requestLayout)],
  ['Request query hook supports enabled and staleTime controls', /options\?: \{ enabled\?: boolean; staleTime\?: number \}/.test(requestHook) && /options\?\.enabled/.test(requestHook)],
  ['Authenticated request viewers fetch their permission-scoped offers once', /staleTime: isAuthenticated \? 0/.test(requestPage)],
  ['Guests reuse the hydrated public request without a browser GET', /staleTime: isAuthenticated \? 0/.test(requestPage) && /enabled: Boolean\(id\) && \(options\?\.enabled \?\? true\)/.test(requestHook)],
  ['Failed authenticated refresh retains public request data and shows stale notice', /if \(!request \|\| requestErrorStatus === 404\)/.test(requestPage) && /isError && request && isAuthenticated/.test(requestPage) && /لن نعرض بيانات العروض الخاصة/.test(requestPage)],
  ['Request offer form and sticky CTA are blocked when private refresh fails', /const canOffer = isAuthenticated && !isOwner && request\.status === 'OPEN' && !isError/.test(requestPage) && /request\.status === 'OPEN' && !isError/.test(requestPage)],
  ['Request hook tests cover guest reuse and authenticated offer refresh', /second GET for guests/.test(requestTest) && /refreshes hydrated public data/.test(requestTest) && /falls back to a browser GET/.test(requestTest) && /retains the anonymous-safe SSR data/.test(requestTest)],
  ['Store page passes the existing server-fetched store into the client storefront', /<StoreStorefront[\s\S]*?store=\{store\}/.test(storePage)],
  ['Store page writes its server-fetched entity to the offline snapshot bridge', /<StoreVisitSnapshot lookupKey=\{id\} store=\{store\}/.test(storePage)],
  ['Store snapshot bridge saves only active public stores under their route key', /saveVisitedPublicStore\(lookupKey, store\)/.test(storeSnapshot) && /store\.status === 'ACTIVE'/.test(storeSnapshot)],
  ['Store product grid receives store-type labels instead of querying store detail again', /storeType\?: StoreType \| null/.test(storeProducts) && /getStoreTypeLabels\(storeType\)/.test(storeProducts) && !/useStore\(/.test(storeProducts)],
  ['Both product and offers tabs pass the server-provided store type', (storeShell.match(/storeType=\{store\?\.storeType\}/g) ?? []).length === 2],
  ['Store hook persists successful client-fetched store detail to the offline snapshot', /saveVisitedPublicStore\(id, store\)/.test(storeHook)],
  ['Store offline snapshot is still used as a transient network fallback', /getVisitedPublicStore\(id\)/.test(storeHook)],
  ['Store fallback continues to render its browser-fetched storefront path', /StoreStorefront/.test(storeFallback)],
  ['Service details keep their existing server-fetched listing props', /<ServiceListingDetail[\s\S]*?listing=\{listing\}/.test(servicePage) && !/useServiceListing\(/.test(servicePage)],
  ['Ad details retain existing server prefetch and hydration for useAd', /HydrationBoundary state=\{dehydrate\(qc\)\}/.test(adPage) && /fetchAdDetailCached = cache\(/.test(adPrefetch)],
  ['Public profile continues to pass server-fetched user data into its sections', /<PublicProfileHeader user=\{user\}/.test(profilePage) && /<ProfileTabsSection user=\{user\}/.test(profilePage)],
  ['Product hook tests cover hydrated cache reuse and offline snapshot persistence', /does not repeat the product detail GET/.test(productTest) && /does not refresh the offline snapshot timestamp/.test(productTest) && /saveVisitedProduct/.test(productTest)],
  ['Store hook tests cover offline persistence for the client-side SSR fallback', /saveVisitedPublicStore/.test(storesTest) && /does not re-save a stale offline store snapshot/.test(storesTest)],
  ['Server-rendered store snapshots have a client-side persistence regression test', /saves an active server-rendered store/.test(storeSnapshotTest) && /saveVisitedPublicStore/.test(storeSnapshotTest)],
  ['Server API adapter does not forward visitor identity into anonymous SSR reads', /const hasAuth = Boolean/.test(serverApiAdapter) && /stripIdentityHeaders/.test(serverApiAdapter)],
  ['Backend request detail restricts offers to the owner or the current offerer', /row\.customerId === viewerUserId/.test(requestService) && /o\.offererUserId === viewerUserId/.test(requestService) && /offers: \[\]/.test(requestService)],
  ['Logout clears the browser QueryClient to prevent cross-account private detail reuse', /cancelAndClearQueryClient\(\)/.test(authCleanup)],
];

for (const [name, passed] of checks) {
  if (!passed) console.error(`[detail-query-dedup-phase3] FAIL ${name}`);
}
assert.equal(checks.filter(([, passed]) => passed).length, checks.length, 'Phase 3 detail dedup regression audit failed');
console.log(`Detail query dedup phase 3 audit: ${checks.length}/${checks.length} checks passed`);
