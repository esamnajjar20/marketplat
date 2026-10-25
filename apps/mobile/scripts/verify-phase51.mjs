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
assert.match(home, /await getCachedPublicCategories\(\)/);
assert.match(detail, /await getCachedAdDetail\(id\)/);
assert.match(detail, /if \(!hasCachedAd\) setErrorMessage/);
assert.ok(pkg.scripts.test.includes('verify-phase50.mjs'));
console.log('Phase 51 local-first cache-first rendering source-contract checks passed (static only; Expo/SQLite/network/device runtime not exercised).');
