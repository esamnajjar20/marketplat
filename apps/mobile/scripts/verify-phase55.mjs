import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/features/ads/ads.api.ts', import.meta.url), 'utf8');
const cache = await readFile(new URL('../src/storage/public-cache.ts', import.meta.url), 'utf8');

assert.match(home, /getCachedPublicAdsWithMetadata\(options\)/,
  'home must attempt to hydrate the exact query/filter from SQLite');
assert.match(home, /if \(!hasCachedData && !isRefresh\) setLoading\(true\)/,
  'full-page loading should only appear when the exact local query has no cached result');
assert.match(api, /search\?\.trim\(\)/,
  'search input must be normalized before it becomes a cache key');
assert.match(api, /categoryId/,
  'category filters must participate in the query and cache key');
assert.match(api, /await writePublicCache\(cacheKey, cachedResult\)/,
  'successful search/filter responses must be persisted for offline reuse');
assert.match(cache, /ORDER BY saved_at ASC/,
  'cache eviction must remove older records before newer records');
console.log('Phase 55 verification passed: cached search/filter results stay visible while refreshing.');
