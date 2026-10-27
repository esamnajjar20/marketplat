import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(home, /const networkState = await NetInfo\.fetch\(\)/, 'Homepage should check known connectivity before issuing the ads request');
assert.match(home, /if \(networkState\.isConnected === false\)/, 'Known-offline devices should avoid an unnecessary ads request');
assert.match(home, /if \(!hasCachedData\) setErrorMessage\('أنت غير متصل بالإنترنت/, 'An uncached offline first visit should explain how to recover');
assert.match(home, /if \(isCurrentRequest\(\)\) \{\s*setLoading\(false\);\s*setRefreshing\(false\);\s*\}/s, 'Loading and refresh indicators should be cleared after an offline early return');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase6\.mjs/, 'Phase 6 verifier should be included in the mobile test script');

console.log('Homepage UX phase 6 verification passed.');
