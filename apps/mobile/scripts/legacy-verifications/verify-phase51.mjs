import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adsApi = await readFile(new URL('../src/features/ads/ads.api.ts', import.meta.url), 'utf8');
const categoriesApi = await readFile(new URL('../src/features/categories/categories.api.ts', import.meta.url), 'utf8');
const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../app/ads/[id].tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(adsApi, /export async function getCachedPublicAds/);
assert.match(adsApi, /export async function getCachedAdDetail/);
assert.match(adsApi, /await writePublicCache\(cacheKey, cachedDetail\)/);
assert.match(categoriesApi, /export async function getCachedPublicCategories/);
assert.match(home, /await getCachedPublicAdsWithMetadata\(options\)/);
assert.doesNotMatch(home, /getCachedPublicCategories/, 'Homepage should avoid a second category-cache read because categories now live on a dedicated route.');
assert.match(home, /getCachedServiceListings/, 'Homepage should retain a cache-first services section.');
assert.match(detail, /await getCachedAdDetail\(id\)/);
assert.match(detail, /if \(!hasCachedAd\) setErrorMessage/);
assert.match(pkg.scripts.test, /run-all-verifications\.mjs/, 'npm test must invoke the discovery runner');
assert.match(readFileSync(new URL('./run-all-verifications.mjs', import.meta.url), 'utf8'), /startsWith\('verify-'\)[\s\S]*endsWith\('\.mjs'\)/, 'verification runner must discover scripts/verify-*.mjs files');
console.log('Phase 51 local-first cache-first rendering and homepage information hierarchy checks passed (static only; Expo/SQLite/network/device runtime not exercised).');
