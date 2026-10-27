import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const layout = read('app/_layout.tsx');
const nav = read('src/components/BottomNavigation.tsx');
const explore = read('app/explore.tsx');
const account = read('app/account.tsx');

assert.match(layout, /<BottomNavigation\s*\/>/, 'Root layout must render the bottom navigation.');
assert.match(layout, /<Stack[\s\S]*?\/>/, 'Expo Router stack must remain in the root layout.');
for (const path of ["'/'", "'/explore'", "'/add'", "'/messages'", "'/account'"]) {
  assert.ok(nav.includes(`path: ${path}`), `Missing bottom tab route ${path}`);
}
assert.match(nav, /accessibilityRole="tab"/, 'Tabs should expose accessible roles.');
assert.match(nav, /accessibilityState=\{\{ selected: active \}\}/, 'Active tab should be exposed accessibly.');
assert.match(nav, /hiddenPrefixes/, 'Full-screen/auth routes should be able to hide the bar.');
assert.match(explore, /الإعلانات والبحث[\s\S]*المنتجات والمتاجر[\s\S]*الخدمات[\s\S]*المجتمع والاكتشاف/, 'Explore links should be organized into clear groups.');
assert.match(account, /المهم الآن[\s\S]*ملفي ونشاطي[\s\S]*إدارة المتجر والخدمات[\s\S]*الإعدادات والخصوصية/, 'Account destinations should be prioritized and grouped.');
for (const path of ['index.tsx', 'explore.tsx', 'add.tsx', 'messages.tsx', 'account.tsx']) {
  assert.ok(existsSync(resolve(root, 'app', path)), `Required route app/${path} must exist.`);
}
for (const route of ['/profile', '/my-ads', '/my-sales', '/my-store', '/my-products', '/my-services', '/my-requests', '/orders', '/notifications', '/settings', '/offline-queue']) {
  const file = route.slice(1) + '.tsx';
  assert.ok(existsSync(resolve(root, 'app', file)), `Account destination ${route} must exist.`);
}
console.log('Bottom navigation and page organization verification passed.');
