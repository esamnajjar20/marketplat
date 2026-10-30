import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/features/ads/ads.api.ts', import.meta.url), 'utf8');
const cache = await readFile(new URL('../src/storage/public-cache.ts', import.meta.url), 'utf8');

assert.match(cache, /export type PublicCacheEntry<T> = \{ value: T; savedAt: number \}/,
  'cache entry must expose the persisted timestamp alongside its value');
assert.match(cache, /SELECT value_json, saved_at FROM public_cache WHERE cache_key = \?/,
  'metadata reads must retrieve the save timestamp from SQLite');
assert.match(cache, /export async function readPublicCacheEntry<T>/,
  'cache should provide a typed metadata read without changing existing read callers');
assert.match(api, /getCachedPublicAdsWithMetadata/,
  'ads API must expose the exact-query cache timestamp');
assert.match(home, /setAdsSavedAt\(cached.savedAt\)/,
  'home must record when the displayed cached result was saved');
assert.match(home, /نسخة محفوظة على الجهاز/,
  'offline/cache fallback must be disclosed to the user');
assert.match(home, /تمت مزامنة الإعلانات/,
  'freshly persisted network data must be distinguishable from cache fallback');
assert.match(home, /latestCache.savedAt === previousSavedAt/,
  'a cached fallback must not be mislabeled as newly synced');
console.log('Phase 56 verification passed: saved-at metadata and cache-vs-sync status are wired.');
