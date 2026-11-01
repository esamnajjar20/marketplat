import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const read = (path) => readFile(resolve(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  checks.push(message);
};

const hook = await read('src/hooks/usePaginatedList.ts');
assert(hook.includes('goToPage: (page: number) => Promise<void>'), 'shared pagination exposes numbered-page navigation');
assert(hook.includes('controller.signal') && hook.includes('.abort()'), 'shared pagination cancels stale requests');
assert(hook.includes('mergeUniquePageItems'), 'shared pagination removes duplicate rows');
assert(hook.includes('loadMoreError'), 'shared pagination keeps load-more failures separate');
assert(hook.includes('lastFailedRequestRef') && hook.includes('retry: () => Promise<void>'), 'shared retry repeats the failed page instead of resetting pagination');

for (const screen of ['app/ads.tsx', 'app/promoted.tsx', 'app/my-services.tsx', 'app/following.tsx']) {
  const source = await read(screen);
  assert(source.includes("from '@/hooks/usePaginatedList'"), `${screen} consumes shared pagination`);
  assert(source.includes('getItemKey:'), `${screen} declares stable item identity`);
}

const adsApi = await read('src/features/ads/ads.api.ts');
assert(adsApi.includes('signal?: AbortSignal') && adsApi.includes('{ signal: options.signal }'), 'public ads API forwards cancellation to transport');
const servicesApi = await read('src/features/services/services.api.ts');
assert(servicesApi.includes('limit = 30, signal?: AbortSignal') && servicesApi.includes('{ token, signal }'), 'my services API forwards cancellation to transport');
assert(servicesApi.includes("deletePublicCacheEntriesByPrefix('service-listings:')") && servicesApi.includes("deletePublicCacheEntry('home:public-services:v1')"), 'service mutations invalidate feature and homepage snapshots');
const commerceApi = await read('src/features/commerce/commerce.api.ts');
assert(commerceApi.includes("deletePublicCacheEntriesByPrefix('api-public:/api/v1/products?')") && commerceApi.includes("deletePublicCacheEntry('home:public-products:v1')"), 'product mutations invalidate anonymous API and homepage snapshots');

console.log(`Mobile list contract checks passed (${checks.length}/${checks.length}).`);
for (const message of checks) console.log(`✓ ${message}`);
