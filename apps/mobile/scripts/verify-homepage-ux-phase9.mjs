import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const highlights = await readFile(new URL('../src/features/discovery/HomeMarketplaceHighlights.tsx', import.meta.url), 'utf8');
const community = await readFile(new URL('../src/features/discovery/HomeCommunitySections.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(highlights, /import NetInfo from '@react-native-community\/netinfo'/, 'Mixed discovery should use the existing connectivity package');
assert.match(highlights, /NetInfo\.fetch\(\)[\s\S]*networkState\.isConnected === false[\s\S]*fetchMixedRecommendations/, 'Known-offline devices should skip optional mixed discovery');
assert.match(community, /NetInfo\.fetch\(\)[\s\S]*networkState\.isConnected === false[\s\S]*fetchStores/, 'Known-offline devices should skip optional store discovery');
assert.match(community, /if \(accessToken\)[\s\S]*fetchStoryFeed\(accessToken\)/, 'Story feed remains gated by an authenticated session');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase9\.mjs/, 'Phase 9 verifier should be included in the mobile test script');

console.log('Homepage UX phase 9 verification passed.');
