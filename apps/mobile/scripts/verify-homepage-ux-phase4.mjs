import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const highlights = await readFile(new URL('../src/features/discovery/HomeMarketplaceHighlights.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(home, /HomeMarketplaceHighlights|fetchMixedRecommendations|اكتشف من السوق/, 'Homepage should not mount mixed discovery or make its request');
assert.match(highlights, /excludeAdIds\?: string\[\]/, 'Mixed preview should accept the current ad IDs as an optional prop');
assert.match(highlights, /row\.kind !== 'ad' \|\| !excludeAdIds\.includes\(row\.item\.id\)/, 'Ads already shown in the latest ads feed should be filtered from discovery');
assert.match(highlights, /onError=\{\(\) => setFailedImageIds/, 'Broken remote images should fall back to the card placeholder');
assert.match(highlights, /if \(visibleItems\.length === 0\) return null/, 'An empty filtered preview should not leave an empty section');

console.log('Homepage UX phase 4 verification passed.');
