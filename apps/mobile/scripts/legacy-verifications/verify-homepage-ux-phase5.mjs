import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const highlights = await readFile(new URL('../src/features/discovery/HomeMarketplaceHighlights.tsx', import.meta.url), 'utf8');
const community = await readFile(new URL('../src/features/discovery/HomeCommunitySections.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(home, /adMain: \{ flexDirection: 'row-reverse', minHeight: 136 \}/, 'Ad cards should use a consistent minimum image/content height');
assert.match(home, /adImage: \{ width: 112, minHeight: 136/, 'Ad image dimensions should match the card layout');
assert.match(home, /favoriteButton: \{ position: 'absolute'.*zIndex: 2/s, 'Favorite control should remain visible above the card image');
assert.match(highlights, /minHeight: 246/, 'Mixed discovery cards should have consistent minimum height');
assert.match(highlights, /flex: 1, padding: spacing\.sm/, 'Discovery card content should fill remaining card height');
assert.match(community, /const \[imageFailed, setImageFailed\] = useState\(false\)/, 'Store cards should handle broken images');
assert.match(community, /onError=\{\(\) => setImageFailed\(true\)\}/, 'Store image failure should switch to a fallback');
assert.match(community, /failedStoryAvatars/, 'Story avatar failures should be tracked');
assert.match(community, /onError=\{\(\) => setFailedStoryAvatars/, 'Story avatar failure should fall back to an initial');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase5\.mjs/, 'Phase 5 verifier should be included in the mobile test script');

console.log('Homepage UX phase 5 verification passed.');
