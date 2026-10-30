import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../src/features/ads/ads.api.ts', import.meta.url), 'utf8');
const detailScreen = await readFile(new URL('../app/ads/[id].tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');

assert.match(api, /images:\s*await cachePublicImages\(response\.data\.images\.filter/,
  'detail responses must cache image files before persisting');
assert.match(api, /await writePublicCache\(cacheKey, cachedDetail\);[\s\S]*?return cachedDetail;/,
  'detail fetch must return the same local-image-backed object persisted in SQLite');
assert.match(detailScreen, /getCachedAdDetail\(id\)/,
  'detail route must hydrate from the local cache before network refresh');
assert.match(home, /getCachedPublicAdsWithMetadata\(options\)/,
  'home ads list must hydrate from the local cache before network refresh');
console.log('Phase 54 verification passed: detail data and local image paths remain consistent.');
