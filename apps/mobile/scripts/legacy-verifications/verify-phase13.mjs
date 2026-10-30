import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const home = read('app/index.tsx');
const store = read('src/features/ads/favorites.store.ts');
const api = read('src/features/ads/ads.api.ts');

assert.match(home, /const options = \{ page: 1, limit: 8, search: submittedSearch, categoryId: undefined \}/, 'home should keep its primary feed independent of the category browser');
assert.match(home, /fetchPublicAds\(options\)/, 'home screen must pass submitted search options to the existing API');
assert.doesNotMatch(home, /selectedCategory/, 'category selection belongs to the dedicated category/search screens.');
assert.match(home, /showFavorites \? ads\.filter/, 'favorites view must filter the loaded ads');
assert.match(home, /toggleFavorite\(ad\.id\)/, 'ad cards must provide a favorite action');
assert.match(home, /onError=\{\(\) => setFailedImageIds/, 'broken remote images must fall back to placeholder');
assert.match(store, /expo-secure-store/, 'favorites must use secure local persistence');
assert.match(store, /JSON\.parse/, 'favorite IDs must be validated while loading');
assert.match(store, /new Set/, 'favorite IDs must be deduplicated');
assert.match(api, /\/api\/v1\/ads/, 'must use the existing ads API, not invent a new endpoint');
assert.ok(existsSync(new URL('app/ads/[id].tsx', root)), 'ad detail screen must remain present');
console.log('Phase 13 ads UX contract checks passed (static source checks only; no native runtime or live API test performed).');
