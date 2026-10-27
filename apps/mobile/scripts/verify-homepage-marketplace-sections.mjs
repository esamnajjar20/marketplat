import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('app/index.tsx');
const sections = read('src/features/discovery/HomeMarketplaceSections.tsx');
const community = read('src/features/discovery/HomeCommunitySections.tsx');
const requestsApi = read('src/features/requests/requests.api.ts');

assert.match(home, /import HomeMarketplaceSections from '@\/features\/discovery\/HomeMarketplaceSections'/);
assert.match(home, /<HomeMarketplaceSections\s*\/>/);
assert.match(home, /أحدث الإعلانات/);
assert.doesNotMatch(home, /HomeMarketplaceHighlights|fetchMixedRecommendations/);
for (const label of ['منتجات مميزة', 'خدمات متاحة', 'طلبات السوق', 'تابع طلباتك ومشترياتك']) {
  assert.ok(sections.includes(label), `Missing homepage section: ${label}`);
}
assert.match(sections, /fetchProducts\(\{ page: 1, limit: 4/);
assert.match(sections, /fetchServiceListings\(\{ page: 1, limit: 4/);
assert.match(sections, /fetchOpenRequests\(\{ page: 1, limit: 4/);
assert.match(sections, /PUBLIC_LIST_TTL_MS = 15 \* 60 \* 1000/);
assert.match(sections, /readPublicCacheEntry/);
assert.match(sections, /writePublicCache/);
assert.match(sections, /publicRequestSnapshot/);
assert.match(sections, /customerId|offers/); // Request type is imported, but snapshot must not copy customer identity or offer details.
assert.match(sections, /return \{ id: item\.id, type: item\.type, title: item\.title, city: item\.city/);
assert.doesNotMatch(sections.match(/function publicRequestSnapshot[\s\S]*?\n}/)?.[0] ?? '', /customer:|customerId:|item\.offers/);
assert.match(sections, /router\.push\('\/orders'\)/);
assert.match(sections, /router\.push\('\/my-requests'\)/);
assert.match(community, /متاجر تستحق الاكتشاف/);
assert.match(community, /لا توجد متاجر متاحة للعرض حاليًا/);
assert.match(requestsApi, /limit\?:number/);
assert.match(requestsApi, /Math\.min\(50,Math\.max\(1,o\.limit\?\?20\)\)/);
console.log('Homepage marketplace sections verification passed.');
