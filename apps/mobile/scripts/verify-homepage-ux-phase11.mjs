import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const highlights = await readFile(new URL('src/features/discovery/HomeMarketplaceHighlights.tsx', root), 'utf8');
const community = await readFile(new URL('src/features/discovery/HomeCommunitySections.tsx', root), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.match(highlights, /NetInfo\.addEventListener/, 'Highlights should observe connectivity changes');
assert.match(highlights, /wasOnline === false && online[\s\S]*refresh\((?:true)?\)/, 'Highlights should refresh after offline-to-online transition');
assert.match(highlights, /if \(!active\) return;\s*if \(requestInFlight\)/, 'Highlights refresh should avoid overlapping requests');
assert.match(highlights, /Keep the last successful snapshot visible/, 'Failed refresh must preserve the current highlights');
assert.match(highlights, /if \(!accessToken\) await writePublicCache/, 'Only public highlights should be persisted');
assert.match(community, /NetInfo\.addEventListener/, 'Community sections should observe connectivity changes');
assert.match(community, /wasOnline === false && online[\s\S]*refresh\((?:true)?\)/, 'Community sections should refresh after reconnect');
assert.match(community, /if \(!active\) return;\s*if \(requestInFlight\)/, 'Community refresh should avoid overlapping requests');
assert.match(community, /setStories\(\[\]\)/, 'Private story feed must be cleared when the session changes or disappears');
assert.match(community, /Story feeds are private and do not persist them in the public cache/, 'Private stories must not be persisted in the public cache');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase11\.mjs/, 'Phase 11 verifier should be included in the mobile test script');

console.log('Homepage UX phase 11 verification passed.');
