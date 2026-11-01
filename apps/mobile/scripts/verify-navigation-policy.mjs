#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = await readFile(join(root, 'src/lib/navigation-policy.ts'), 'utf8');
const bottom = await readFile(join(root, 'src/components/BottomNavigation.tsx'), 'utf8');
const drawer = await readFile(join(root, 'src/components/MobileDrawer.tsx'), 'utf8');
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
assert.match(policy, /function getRouteAccess/);
assert.match(policy, /function requiresAuthenticatedUser/);
console.log(`Navigation policy checks passed (${paths.length} declared destinations; shared tab/drawer source).`);
