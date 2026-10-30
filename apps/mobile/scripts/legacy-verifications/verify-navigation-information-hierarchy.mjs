import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const nav = read('src/components/BottomNavigation.tsx');
const shell = read('src/components/MobileUI.tsx');
const home = read('app/index.tsx');
const explore = read('app/explore.tsx');
const account = read('app/account.tsx');
const layout = read('app/_layout.tsx');

// Global navigation must be present, accessible, and limited to the five primary destinations.
assert.match(layout, /<BottomNavigation\s*\/>/);
for (const [label, route] of [['الرئيسية', 'index.tsx'], ['استكشف', 'explore.tsx'], ['إضافة', 'add.tsx'], ['الرسائل', 'messages.tsx'], ['حسابي', 'account.tsx']]) {
  assert.ok(nav.includes(`label: '${label}'`), `Missing primary navigation item: ${label}`);
  assert.ok(existsSync(resolve(root, 'app', route)), `Missing route for ${label}: ${route}`);
}
assert.match(nav, /accessibilityRole="tab"/);
assert.match(nav, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(nav, /isBottomNavigationHidden/);
assert.match(shell, /isBottomNavigationHidden\(pathname\)/, 'PageShell must avoid adding a second bottom inset when the bar is visible.');
assert.match(shell, /edges: \('top' \| 'bottom'\)\[\]/);

// The home screen should prioritize search and current ads; advanced filters stay collapsed until requested.
assert.match(home, /heroTitle/);
assert.match(home, /أحدث الإعلانات/);
assert.match(home, /خدمات قريبة منك/);
assert.match(home, /fetchServiceListings/);
assert.match(home, /showFilters/);
assert.match(home, /!showFavorites && showFilters/);
assert.doesNotMatch(home, /تصفّح الأقسام|categoryGrid|fetchPublicCategories/);
assert.doesNotMatch(home, /<Text style=\{styles\.quickTitle\}>الرائج الآن<\/Text>/, 'Do not duplicate discovery sections as homepage shortcuts.');

// Discovery and account destinations are grouped by user intent and priority.
assert.match(explore, /الإعلانات والبحث[\s\S]*المنتجات والمتاجر[\s\S]*الخدمات[\s\S]*المجتمع والاكتشاف/);
assert.match(account, /المهم الآن[\s\S]*ملفي ونشاطي[\s\S]*إدارة المتجر والخدمات[\s\S]*الإعدادات والخصوصية/);
for (const route of ['/messages', '/notifications', '/my-sales', '/orders', '/my-ads', '/profile', '/my-store', '/my-products', '/my-services', '/my-requests', '/appointments', '/settings', '/offline-queue', '/storage', '/blocked-users', '/my-reports']) {
  const candidate = resolve(root, 'app', `${route.slice(1)}.tsx`);
  assert.ok(existsSync(candidate), `Account hub points to a missing route: ${route}`);
}

// Check that every top-level route has a file; dynamic segments are represented by [param] directories.
const appRoot = resolve(root, 'app');
const routes = [];
function walk(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('+')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, `${prefix}/${entry.name}`);
    else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') routes.push(`${prefix}/${entry.name.replace(/\.tsx$/, '')}`.replace(/\/index$/, '') || '/');
  }
}
walk(appRoot);
assert.ok(routes.length >= 70, `Unexpectedly low route count (${routes.length}); route inventory may be incomplete.`);
assert.ok(routes.includes('/'), 'Root home route must exist.');
console.log(`Navigation/information hierarchy audit passed (${routes.length} route files inventoried).`);
