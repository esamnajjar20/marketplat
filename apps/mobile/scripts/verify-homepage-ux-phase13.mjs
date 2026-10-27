import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const highlights = await readFile(new URL('src/features/discovery/HomeMarketplaceHighlights.tsx', root), 'utf8');
const community = await readFile(new URL('src/features/discovery/HomeCommunitySections.tsx', root), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.match(highlights, /itemsScope === 'public'/,
  'Public cached highlights should remain eligible to display');
assert.match(highlights, /itemsScope === 'private' && itemsOwnerId === user\.id/,
  'Personalized highlights must be scoped to the active account');
assert.match(highlights, /setItemsScope\(accessToken \? 'private' : 'public'\)/,
  'Fetched highlights must be marked public or private based on authentication');
assert.match(highlights, /if \(!accessToken\) await writePublicCache/,
  'Authenticated/personalized highlights must never enter the public cache');
assert.match(community, /storiesOwnerId === user\.id/,
  'Private story feeds must only render for the account that fetched them');
assert.match(community, /setStoriesOwnerId\(user\.id\)/,
  'Successful private story fetches must record their owning account');
assert.match(community, /setStoriesOwnerId\(null\)/,
  'Story ownership must reset when the session-scoped effect restarts');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase13\.mjs/,
  'Phase 13 verifier should be included in the mobile test script');

console.log('Homepage UX phase 13 verification passed.');
