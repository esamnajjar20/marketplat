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
const list = home.slice(home.indexOf('const listRows'), home.indexOf('return (', home.indexOf('const listRows')));
assert.ok(list.indexOf("{ type: 'adsHeader' }") < list.indexOf("{ type: 'footer' }"));
assert.ok(list.indexOf("{ type: 'footer' }") < list.indexOf("{ type: 'sections' }"));
assert.ok(home.indexOf("if (item.type === 'adsHeader')") < home.indexOf("if (item.type === 'sections')"));
assert.ok(home.indexOf('{showFilters ? (', home.indexOf("if (item.type === 'adsHeader')")) < home.indexOf("if (item.type === 'sections')"));
assert.match(home, /accessibilityLabel="تصفح المتاجر"[\s\S]*?router\.push\('\/stores'\)/);
assert.match(cards, /imageResizeMode\?: 'cover' \| 'contain'/);
assert.match(cards, /height: 132/);
assert.match(community, /imageResizeMode=\{store\.logoUrl \? 'contain' : 'cover'\}/);
assert.match(community, /متجر جديد/);
assert.match(marketplace, /styles\.ctaCompact/);
console.log('PASS: homepage order, filters placement, store imagery, ratings, and compact CTA contracts.');
