import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const salesApi = read('api/sales.api.ts');
const storesApi = read('api/stores.api.ts');
const listingsApi = read('api/service-listings.api.ts');
const sellersApi = read('api/sellers.api.ts');
const sales = read('hooks/queries/useSales.ts');
const stores = read('hooks/queries/useStores.ts');
const listings = read('hooks/queries/useServiceListings.ts');
const sellers = read('hooks/queries/useSellers.ts');
const checks = [
  ['sales read API methods accept Axios config', /list: \(params\?: SalesListQueryParams, config\?: AxiosRequestConfig\)/.test(salesApi) && /summary: \([^\n]+config\?: AxiosRequestConfig\)/.test(salesApi) && /dashboard: \(config\?: AxiosRequestConfig\)/.test(salesApi) && /report: \([^\n]+config\?: AxiosRequestConfig\)/.test(salesApi) && /smartInsights: \(config\?: AxiosRequestConfig\)/.test(salesApi)],
  ['all sales queryFns pass TanStack signal', (sales.match(/queryFn: \(\{[^}]*signal[^}]*\}\)/g) ?? []).length === 10 && /salesApi\.list\(queryKey\[2\], \{ signal \}\)/.test(sales)],
  ['store browse/detail/owner queries pass signal', /getAll\(params, \{ signal \}\)/.test(stores) && /getById\(id, \{ signal \}\)/.test(stores) && /getMyStore\(\{ signal \}\)/.test(stores) && /getMyStoreAnalytics\(\{ signal \}\)/.test(stores) && /getMyFollowedStores\(params, \{ signal \}\)/.test(stores)],
  ['store API supports Axios config without dropping params', /getAll: \(params\?: StoresQuery, config\?: AxiosRequestConfig\)/.test(storesApi) && /\.get<ApiResponse<StoreWithSeller\[\]>>\('\/stores', \{ \.\.\.config, params \}\)/.test(storesApi)],
  ['store cancellation is not treated as offline fallback', (stores.match(/if \(signal\.aborted\) throw err/g) ?? []).length === 2],
  ['service listing read queries pass signal', /getAll\(params, \{ signal \}\)/.test(listings) && /getById\(id, \{ signal \}\)/.test(listings) && /getMine\(params, \{ signal \}\)/.test(listings)],
  ['service listing cancellation is not treated as offline fallback', /if \(signal\.aborted\) throw err/.test(listings)],
  ['service listing API retains serialized filters with config', /getAll: \(params\?: ServiceListingsQuery, config\?: AxiosRequestConfig\)/.test(listingsApi) && /\.get<ApiResponse<ServiceListingWithProvider\[\]>>\('\/service-listings', \{ \.\.\.config, params: requestParams \}\)/.test(listingsApi)],
  ['seller public and self queries pass signal', /getById\(id, \{ signal \}\)/.test(sellers) && /getMyProfile\(\{ signal \}\)/.test(sellers) && /getMyAttention\(\{ signal \}\)/.test(sellers)],
  ['seller offline fallbacks ignore intentional cancellation', (sellers.match(/if \(signal\.aborted\) throw err/g) ?? []).length === 2],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`Query abort signal phase 12 audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} query abort signal phase 12 audit checks failed`);
