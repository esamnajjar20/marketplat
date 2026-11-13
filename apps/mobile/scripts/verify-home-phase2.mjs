#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [home, cards, community, marketplace] = await Promise.all([
  read('../app/index.tsx'),
  read('../src/components/MarketCards.tsx'),
  read('../src/features/discovery/HomeCommunitySections.tsx'),
  read('../src/features/discovery/HomeMarketplaceSections.tsx'),
]);
const list = home.slice(home.indexOf('const HOME_LIST_ROWS'), home.indexOf('];', home.indexOf('const HOME_LIST_ROWS')));
assert.ok(list.indexOf("{ type: 'adsHeader' }") < list.indexOf("{ type: 'footer' }"));
assert.ok(list.indexOf("{ type: 'footer' }") < list.indexOf("{ type: 'sections' }"));
const renderStart = home.indexOf('const renderItem = useCallback');
assert.ok(renderStart > 0, 'Home renderItem must be a stable useCallback');
assert.ok(home.indexOf("if (item.type === 'adsHeader')", renderStart) < home.indexOf("if (item.type === 'sections')", renderStart));
// Filters panel lives in the memoized HomeAdsHeader component, which must render before the sections block exists.
assert.ok(home.indexOf('const HomeAdsHeader = memo(') > 0 && home.indexOf('{showFilters ? (', home.indexOf('const HomeAdsHeader = memo(')) < renderStart);
// Performance contracts: carousel uses recycling AppFlashList, memoized blocks, deferred secondary sections.
assert.match(home, /<AppFlashList\s+horizontal/);
assert.match(home, /const HomeAdsCarousel = memo\(/);
assert.match(home, /deferToIdle\(\(\) => setSectionsReady\(true\)/);
assert.match(community, /onAction=\{\(\) => pushOnce\('\/stores'\)\}/);
assert.match(cards, /imageResizeMode\?: 'cover' \| 'contain'/);
assert.match(cards, /height: 132/);
assert.match(community, /imageResizeMode=\{store\.logoUrl \? 'contain' : 'cover'\}/);
assert.match(community, /متجر جديد/);
assert.match(marketplace, /styles\.ctaCompact/);
console.log('PASS: homepage order, filters placement, store imagery, ratings, and compact CTA contracts.');
