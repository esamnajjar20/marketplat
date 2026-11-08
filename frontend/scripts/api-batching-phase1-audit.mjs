import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = read('../apps/api/src/modules/stores/stores.routes.ts');
const service = read('../apps/api/src/modules/stores/stores.service.ts');
const badges = read('../apps/api/src/modules/badges/badges.service.ts');
const api = read('api/stores.api.ts');
const query = read('hooks/queries/useStores.ts');
const header = read('components/stores/StoreHeader.tsx');
const storefront = read('components/stores/StoreStorefront.tsx');
const serviceTest = read('../apps/api/tests/unit/stores.service.test.ts');
const headerTest = read('__tests__/components/StoreHeader.test.tsx');
const queryTest = read('__tests__/unit/hooks/useStores.test.tsx');

const checks = [
  ['Aggregate route applies optional auth and private no-store cache policy', /get\('\/:id\/page-data',\s*optionalAuthenticateWithUserLookup,\s*CACHE\.NONE,\s*storesController\.getPublicStorePageData\)/.test(routes)],
  ['Aggregate service returns store, badges and viewer flags without double-counting normal SSR views', /async function getPublicStorePageData[\s\S]*?return \{ store, badges, viewer \}/.test(service) && /if \(trackView\) recordPublicStoreView\(store\.id\)/.test(service) && /recordPublicStoreView\(store\.id\)/.test(service)],
  ['Badge computation reuses the already-loaded store record', /getStoreBadgesForRecord/.test(badges) && /badgesService\.getStoreBadgesForRecord\(store\)/.test(service)],
  ['Follow and favorite status reads run concurrently and use repositories without a service cycle', /Promise\.all\(\[[\s\S]*?followsRepository\.find[\s\S]*?favoritesRepository\.findByUserAndEntity/.test(service) && !/from '\.\.\/favorites\/favorites\.service'/.test(service)],
  ['Frontend exposes one aggregate page-data request', /getPageData:[\s\S]*?`\/stores\/\$\{id\}\/page-data`/.test(api)],
  ['Aggregate query cache is scoped by viewer identity', /queryKeys\.stores\.detail\(id\), 'viewer', viewerId \?\? 'anonymous'/.test(query)],
  ['Normal StoreHeader path consumes the aggregate query and aggregate badges suppress the duplicate badges call', /const pageQuery = useStore\(store\.id/.test(header) && /resolvedFavorited = isFavorited \?\? pageQuery\.data\?\.viewer\?\.isFavorited/.test(header) && /<StoreBadges storeId=\{store\.id\} badges=\{resolvedBadges\}/.test(header)],
  ['Individual follow/favorite/badge checks are fallback-only during aggregate failure', /enabled: resolvedFollowing === undefined && pageQuery\.isError/.test(header) && /resolvedFavorited === undefined && pageQuery\.isError/.test(header) && /pageQuery\.isError \? undefined : \[\]/.test(header)],
  ['Aggregate favorite state seeds the shared Set for offline toggle correctness', /queryKeys\.favorites\.entityIds\('STORE'\)/.test(header) && /next\.add\(store\.id\)/.test(header) && /next\.delete\(store\.id\)/.test(header)],
  ['Unopened store tabs remain conditionally mounted', /active === 'products'/.test(storefront) && /active === 'offers'/.test(storefront) && /active === 'collections'/.test(storefront) && /active === 'ads'/.test(storefront)],
  ['Backend service/controller and StoreHeader tests cover the aggregate response and view-count behavior', /getPublicStorePageData/.test(serviceTest) && /combined page response/.test(headerTest) && /records a view only when the client-side SSR fallback explicitly asks for it/.test(serviceTest) && /incrementViews\)\.not\.toHaveBeenCalled/.test(serviceTest)],
  ['Frontend query test guards viewer-specific cache separation', /scopes aggregate viewer flags to the signed-in account/.test(queryTest)],
  ['Client-side SSR fallback explicitly records a view while normal header fetches do not', /useStore\(id, \{ trackView: true \}\)/.test(read('components/stores/StoreDetailClient.tsx')) && /params: \{ trackView: true \}/.test(query)],
];

for (const [name, passed] of checks) {
  if (!passed) console.error(`FAIL ${name}`);
}
assert.equal(checks.filter(([, passed]) => passed).length, checks.length, 'API batching phase 1 audit failed');
console.log(`API batching phase 1 audit: ${checks.length}/${checks.length} checks passed`);
