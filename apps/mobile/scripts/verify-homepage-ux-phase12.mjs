import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const highlights = await readFile(new URL('src/features/discovery/HomeMarketplaceHighlights.tsx', root), 'utf8');
const community = await readFile(new URL('src/features/discovery/HomeCommunitySections.tsx', root), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.match(highlights, /readPublicCacheEntry/,
  'Highlights should use cache timestamps to make freshness decisions');
assert.match(highlights, /PUBLIC_HIGHLIGHTS_TTL_MS = 3 \* 60 \* 1000/,
  'Public highlights should have a short freshness window');
assert.match(highlights, /Date\.now\(\) - lastSuccessfulAt < PUBLIC_HIGHLIGHTS_TTL_MS/,
  'Fresh public highlights should avoid a redundant mount-time request');
assert.match(highlights, /refresh\(true\)/,
  'Highlights must force refresh after reconnect even when cached data is fresh');
assert.match(community, /readPublicCacheEntry/,
  'Store cards should restore savedAt along with cached public data');
assert.match(community, /PUBLIC_STORES_TTL_MS = 10 \* 60 \* 1000/,
  'Public stores should have a bounded freshness window');
assert.match(community, /Date\.now\(\) - lastStoresSuccessfulAt < PUBLIC_STORES_TTL_MS/,
  'Fresh public stores should avoid a redundant mount-time request');
assert.match(community, /refresh\(true\)/,
  'Stores should refresh after reconnect even when the cache is fresh');
assert.match(community, /Story feeds are private and do not persist them in the public cache/,
  'Private stories must remain outside the public cache');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase12\.mjs/,
  'Phase 12 verifier should be included in the mobile test script');

console.log('Homepage UX phase 12 verification passed.');
