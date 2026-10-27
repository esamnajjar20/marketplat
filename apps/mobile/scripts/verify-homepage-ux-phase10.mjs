import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const highlights = await readFile(new URL('../src/features/discovery/HomeMarketplaceHighlights.tsx', import.meta.url), 'utf8');
const community = await readFile(new URL('../src/features/discovery/HomeCommunitySections.tsx', import.meta.url), 'utf8');
const cache = await readFile(new URL('../src/storage/public-cache.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(highlights, /readPublicCache[\s\S]*PUBLIC_HIGHLIGHTS_CACHE_KEY/, 'Public mixed highlights should read their persisted snapshot');
assert.match(highlights, /if \(!accessToken\)[\s\S]*writePublicCache\(PUBLIC_HIGHLIGHTS_CACHE_KEY/, 'Only anonymous/public mixed recommendations should be persisted');
assert.match(highlights, /networkState\.isConnected === false/, 'Known-offline devices should keep cache and skip optional requests');
assert.match(highlights, /Keep the last successful snapshot visible/, 'Failed refresh should preserve the previous snapshot');
assert.match(community, /readPublicCacheEntry<StoreSummary\[\]>\(PUBLIC_STORES_CACHE_KEY\)/, 'Store section should hydrate cache data with its saved timestamp');
assert.match(community, /writePublicCache\(PUBLIC_STORES_CACHE_KEY/, 'Successful store fetches should update the public cache');
assert.match(community, /Story feeds are private[\s\S]*do not persist them/, 'Private story feed must not be stored in the public cache');
assert.match(community, /setStories\(\[\]\)/, 'Story feed state should be cleared when the session is absent or changes');
assert.match(cache, /SQLite-backed cache for public read-only data/, 'Reuse existing bounded SQLite cache rather than adding a new storage system');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase10\.mjs/, 'Phase 10 verifier should be included in the mobile test script');

console.log('Homepage UX phase 10 verification passed.');
