import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const highlights = await readFile(new URL('../src/features/discovery/HomeMarketplaceHighlights.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(home, /HomeMarketplaceHighlights|fetchMixedRecommendations|اكتشف من السوق/, 'Homepage must not mount the mixed recommendations section or trigger its request');
assert.match(home, /homeShortcuts/, 'Homepage must use compact shortcut tiles');
assert.match(home, /title: 'المتاجر'/, 'Homepage shortcuts must expose stores');
assert.match(home, /title: 'الخدمات'/, 'Homepage shortcuts must expose services');
assert.match(home, /title: 'طلبات السوق'/, 'Homepage shortcuts must expose marketplace requests');
assert.doesNotMatch(home, /تصفّح الأقسام|filteredCategories\.slice/, 'Duplicated category grid should stay off the homepage; categories are reached through Explore');
assert.match(home, /path: '\/explore'/, 'All categories remain available through the Explore shortcut');
assert.match(highlights, /fetchMixedRecommendations\(12, accessToken\)/, 'Mixed preview should use one combined recommendations request');
assert.match(highlights, /kind: 'product'/, 'Mixed preview should include products');
assert.match(highlights, /kind: 'service'/, 'Mixed preview should include services');
assert.match(highlights, /kind: 'ad'/, 'Mixed preview should include ads');
assert.match(highlights, /catch \{[\s\S]*?Keep the last successful snapshot visible/, 'Optional feed errors must not block the home screen or erase the last snapshot');

console.log('Homepage multi-section verification passed.');
