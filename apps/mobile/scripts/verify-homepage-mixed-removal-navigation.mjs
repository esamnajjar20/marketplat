import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const home = fs.readFileSync('app/index.tsx', 'utf8');
const nav = fs.readFileSync('src/components/BottomNavigation.tsx', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const community = fs.readFileSync('src/features/discovery/HomeCommunitySections.tsx', 'utf8');

assert.doesNotMatch(home, /HomeMarketplaceHighlights|fetchMixedRecommendations|اكتشف من السوق/, 'Homepage must not render or request the mixed recommendations section');
assert.doesNotMatch(home, /excludedHighlightAdIds/, 'Removed mixed section must not leave unnecessary derived state');
assert.match(home, /<HomeCommunitySections\s*\/>/, 'Store and story community sections should remain on the homepage');
assert.match(home, /fetchPublicAds\(options\)/, 'Latest ads feed should remain available on the homepage');
assert.match(community, /fetchStores/, 'Store preview remains independent from mixed recommendations');
assert.match(nav, /if \(!active\) router\.navigate\(tab\.path as never\)/, 'Tapping the current tab should not trigger redundant navigation');
assert.match(nav, /product-categories|service-types/, 'Explore tab should remain active on category/type pages');
assert.match(nav, /appointments|service-requests|installments|debts|customers/, 'Account tab should cover account and seller-management pages');
assert.match(layout, /gestureEnabled: true/, 'Native stack should allow gesture-based back navigation where supported');

const appRoot = path.resolve('app');
const routeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.startsWith('_')) routeFiles.push(full);
  }
}
walk(appRoot);
const routes = new Set(routeFiles.map((file) => {
  const relative = path.relative(appRoot, file).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');
  return (relative === 'index' ? '/' : `/${relative}`).replace(/\[[^/]+\]/g, ':param');
}));
const homeDestinations = ['/search?type=ads', '/stores', '/products', '/services', '/requests', '/stories', '/sellers-ranking', '/explore'];
for (const destination of homeDestinations) {
  const route = destination.split(/[?#]/)[0];
  assert.ok(routes.has(route), `Homepage shortcut points to missing route: ${destination}`);
}
for (const destination of ['/','/explore','/add','/messages','/account','/product-categories','/service-types','/appointments','/service-requests','/installments','/debts','/customers']) {
  assert.ok(routes.has(destination), `Navigation destination has no route file: ${destination}`);
}
console.log('Mixed homepage section removal and navigation audit passed.');
