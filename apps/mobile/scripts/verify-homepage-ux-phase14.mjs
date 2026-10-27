import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const highlights = await readFile(new URL('src/features/discovery/HomeMarketplaceHighlights.tsx', root), 'utf8');
const community = await readFile(new URL('src/features/discovery/HomeCommunitySections.tsx', root), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

for (const [name, source] of [['highlights', highlights], ['community', community]]) {
  assert.match(source, /let refreshQueued = false;/, `${name}: a forced refresh arriving during an in-flight request must be queued`);
  assert.match(source, /if \(force\) refreshQueued = true;/, `${name}: reconnect refresh must not be silently discarded`);
  assert.match(source, /if \(active && refreshQueued\) \{\s*refreshQueued = false;\s*void refresh\(true\);\s*\}/, `${name}: queued refresh must run after the active request settles`);
}
assert.match(community, /if \(!active\) return;\s*lastStoresSuccessfulAt = Date\.now\(\);\s*await writePublicCache\(PUBLIC_STORES_CACHE_KEY, nextStores\);/, 'A stale effect must not persist store data after its session-scoped effect was cleaned up');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase14\.mjs/, 'Phase 14 verifier must be included in the mobile test script');

console.log('Homepage UX phase 14 verification passed.');
