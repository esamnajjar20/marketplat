import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(home, /useMemo, useRef/, 'Home should use memoized derived state');
assert.doesNotMatch(home, /excludedHighlightAdIds|HomeMarketplaceHighlights|fetchMixedRecommendations/, 'Homepage should not maintain state for a removed mixed section');
assert.match(home, /const favoriteIdSet = useMemo\(\(\) => new Set\(favoriteIds\), \[favoriteIds\]\)/, 'Favorite membership checks should use a memoized Set');
assert.match(home, /const visibleAds = useMemo\([\s\S]*\[ads, showFavorites, favoriteIdSet\]/, 'Visible ads should be derived once per relevant state change');
assert.doesNotMatch(home, /HomeMarketplaceHighlights/, 'Mixed highlights should remain off the homepage');
assert.ok(home.includes('{visibleAds.map((ad) => {'), 'Ad cards should render the memoized visible list');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase8\.mjs/, 'Phase 8 verifier should be included in the mobile test script');

console.log('Homepage UX phase 8 verification passed.');
