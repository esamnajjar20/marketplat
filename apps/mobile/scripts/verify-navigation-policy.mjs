#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await readFile(join(root, 'src/lib/navigation-policy.ts'), 'utf8');
const bottom = await readFile(join(root, 'src/components/BottomNavigation.tsx'), 'utf8');
const drawer = await readFile(join(root, 'src/components/MobileDrawer.tsx'), 'utf8');
const layout = await readFile(join(root, 'app/_layout.tsx'), 'utf8');
const walkRoutes = async (directory, prefix = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) routes.push(...await walkRoutes(join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.startsWith('_')) {
      const routeBody = relative.slice(0, -4).replace(/\\/g, '/').replace(/\/index$/, '');
      const route = routeBody === 'index' || routeBody === '' ? '/' : `/${routeBody}`;
      routes.push(route);
    }
  }
  return routes;
};
const appRoutes = await walkRoutes(join(root, 'app'));
assert.ok(appRoutes.length >= 100, `expected a complete Expo route scan, found ${appRoutes.length}`);
assert.equal(new Set(appRoutes).size, appRoutes.length, 'Expo route files must not collide on route paths');
assert.ok(!appRoutes.includes('/_layout.QUERY-SNIPPET'), 'temporary layout snippets must not live inside the route directory');
assert.match(bottom, /MAIN_TABS/);
assert.match(bottom, /getActiveMainTab/);
assert.match(bottom, /shouldHideBottomNavigation/);
assert.match(drawer, /DRAWER_ITEMS/);
assert.doesNotMatch(bottom, /const\s+(?:tabs|exploreRoots|accountRoots)\s*=/);
assert.doesNotMatch(drawer, /const\s+DRAWER_ITEMS\s*=/);
const tabBlock = policy.split('export const MAIN_TABS')[1]?.split('export const DRAWER_ITEMS')[0] ?? '';
const drawerBlock = policy.split('export const DRAWER_ITEMS')[1]?.split('const AUTH_ONLY_EXACT')[0] ?? '';
const extractPaths = (block) => [...block.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]);
const tabPaths = extractPaths(tabBlock);
const drawerPaths = extractPaths(drawerBlock);
assert.equal(new Set(tabPaths).size, tabPaths.length, 'main tabs contain duplicate destinations');
assert.equal(new Set(drawerPaths).size, drawerPaths.length, 'drawer contains duplicate destinations');
const paths = [...tabPaths, ...drawerPaths];
for (const path of [...new Set(paths)]) {
  const relative = path === '/' ? 'index' : path.slice(1);
  const candidates = [join(root, 'app', `${relative}.tsx`), join(root, 'app', relative, 'index.tsx')];
  let found = false;
  for (const candidate of candidates) {
    try { await access(candidate); found = true; break; } catch { /* try next */ }
  }
  assert.ok(found, `navigation destination has no Expo Router screen: ${path}`);
}
const authExactBlock = policy.match(/const AUTH_ONLY_EXACT = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
const authPrefixBlock = policy.match(/const AUTH_ONLY_PREFIXES = \[([\s\S]*?)\];/)?.[1] ?? '';
const criticalPrivateRoutes = ['/favorites', '/appointments', '/blocked-users', '/customers', '/debts', '/installments', '/saved-searches', '/sessions'];
for (const route of criticalPrivateRoutes) {
  assert.ok(authExactBlock.includes(`'${route}'`) || authPrefixBlock.includes(`'${route}'`), `private route missing from central auth policy: ${route}`);
  assert.ok(appRoutes.includes(route), `expected protected route file is missing: ${route}`);
}
assert.match(policy, /function getRouteAccess/);
assert.match(policy, /function requiresAuthenticatedUser/);
assert.match(drawer, /getRouteAccess\(item\.path\)/, 'drawer auth decisions must come from the central route policy');
assert.match(layout, /requiresAuthenticatedUser\(pathname\)/, 'root layout must enforce the route access policy');
assert.match(layout, /pathname:\s*['"]\/login['"],\s*params:\s*\{\s*redirect:\s*pathname\s*\}/, 'private routes must preserve a safe typed post-login destination');
console.log(`Navigation policy checks passed (${paths.length} declared navigation destinations; ${appRoutes.length} Expo route files scanned; root guard and drawer use shared route policy).`);
