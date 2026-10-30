#!/usr/bin/env node
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..');
const drawerPath = join(mobile, 'src/components/MobileDrawer.tsx');
const drawer = await readFile(drawerPath, 'utf8');
const layout = await readFile(join(mobile, 'app/_layout.tsx'), 'utf8');
const appHeader = await readFile(join(mobile, 'src/components/ui/AppHeader.tsx'), 'utf8');
const home = await readFile(join(mobile, 'app/index.tsx'), 'utf8');
const icons = await readFile(join(mobile, 'src/components/Icons.tsx'), 'utf8');

assert.match(layout, /<MobileDrawerProvider>/, 'RootChrome must mount the drawer provider');
assert.match(appHeader, /<DrawerMenuButton\s*\/>/, 'shared AppHeader must expose the drawer trigger');
assert.match(home, /<DrawerMenuButton\s*\/>/, 'custom home header must expose the drawer trigger');
assert.match(drawer, /BackHandler\.addEventListener\('hardwareBackPress'/, 'Android back must close the drawer');
assert.match(drawer, /pointerEvents=\{open \? 'auto' : 'none'\}/, 'closed overlay must not block screen input');
assert.match(drawer, /accessibilityElementsHidden=\{!open\}/, 'closed drawer content must be hidden from screen readers');
assert.match(drawer, /importantForAccessibility=\{open \? 'yes' : 'no-hide-descendants'\}/, 'Android accessibility tree must hide closed drawer descendants');
assert.match(drawer, /accessibilityRole=\"link\"[\s\S]*?accessibilityState=\{\{ selected: active \}\}/, 'drawer destinations must be exposed as selected navigation links');
assert.match(drawer, /accessibilityRole=\"header\"/, 'drawer section labels must be announced as headings');
assert.match(drawer, /accessibilityHint=\{item\.requiresAuth && !user/, 'authentication-only destinations must explain the sign-in redirect');
assert.match(drawer, /minHeight: 48/, 'drawer rows must meet minimum touch target height');
assert.match(drawer, /onClose\(\);\s*const target = item\.requiresAuth && !user \? '\/login' : item\.path;/, 'drawer navigation must close before selecting a destination');
assert.match(drawer, /onMoveShouldSetPanResponder[\s\S]*?isRTL \? gesture\.dx < 0 : gesture\.dx > 0/, 'edge gesture must open according to RTL/LTR direction');
assert.match(drawer, /useSQLCipher|source=\{require\('\.\.\/\.\.\/assets\/icon\.png'\)\}/, 'drawer must use the project app icon in its header');
for (const glyph of ['menu', 'settings', 'help', 'ads', 'orders', 'logout', 'login']) {
  assert.match(icons, new RegExp(`\\b${glyph}:`), `missing shared glyph: ${glyph}`);
}

const routeFiles = new Map([
  ['/', 'app/index.tsx'],
  ['/explore', 'app/explore.tsx'],
  ['/add', 'app/add.tsx'],
  ['/messages', 'app/messages.tsx'],
  ['/favorites', 'app/favorites.tsx'],
  ['/notifications', 'app/notifications.tsx'],
  ['/account', 'app/account.tsx'],
  ['/profile', 'app/profile.tsx'],
  ['/my-ads', 'app/my-ads.tsx'],
  ['/orders', 'app/orders.tsx'],
  ['/settings', 'app/settings.tsx'],
  ['/suggestions', 'app/suggestions.tsx'],
  ['/login', 'app/login.tsx'],
]);
for (const [route, file] of routeFiles) {
  await access(join(mobile, file));
  assert.ok(drawer.includes(`path: '${route}'`) || route === '/login', `drawer route missing from menu: ${route}`);
}

const pkg = JSON.parse(await readFile(join(mobile, 'package.json'), 'utf8'));
assert.ok(!pkg.dependencies['@react-navigation/drawer'], 'custom drawer should not add an unneeded navigation dependency');
console.log('✅ Navigation drawer checks passed: provider, shared triggers, RTL gestures, close behavior, auth actions, touch targets, glyphs, and route existence.');
