#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const routes = read('lib/offlineRouteShells.ts');
const sw = read('public/sw.js');
const version = read('lib/cacheVersion.ts');
const failures = [];
let passed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log(`[offline-pinned-shells] PASS ${name}`); }
  else { failures.push(name); console.error(`[offline-pinned-shells] FAIL ${name}`); }
}
check('public permanent shell allowlist includes offline and stable informational pages', /PERMANENT_PUBLIC_SHELL_ROUTES[\s\S]*?'\/offline'[\s\S]*?'\/about'[\s\S]*?'\/privacy'[\s\S]*?'\/terms'/.test(routes));
check('personal permanent shell allowlist includes create flows', /PERMANENT_PERSONAL_SHELL_ROUTES[\s\S]*?'\/ads\/create'[\s\S]*?'\/my-store\/products\/new'[\s\S]*?'\/my-services\/new'[\s\S]*?'\/requests\/new'/.test(routes));
check('edit routes and dynamic hubs are not included in the pinned allowlist', !/PERMANENT_PERSONAL_SHELL_ROUTES[\s\S]{0,700}\/\[id\]\/edit/.test(routes));
check('public periodic warming bypasses age refresh for pinned shells', /const permanentShell = isPermanentShellRoute\(route, false\);[\s\S]{0,250}!permanentShell && prior\?\.status/.test(routes));
check('personal periodic warming bypasses age refresh for pinned shells', /const permanentShell = isPermanentShellRoute\(route, true\);[\s\S]{0,250}!permanentShell && prior\?\.status/.test(routes));
check('incomplete pinned shells are still repaired and explicit force still refreshes', /force \|\|\s*!cacheAudit\.complete/.test(routes));
check('cache trimming protects pinned shell HTML and referenced JS/CSS assets', /collectPermanentShellAssets\(\)/.test(sw) && /permanentBonus = permanentShell \? 1_000_000_000 : permanentAsset \? 900_000_000/.test(sw));
check('SW and TypeScript cache versions match v50', /CACHE_VERSION = 'v50'/.test(sw) && /SW_CACHE_VERSION = 'v50'/.test(version));
if (failures.length) { console.error(`${failures.length} failure(s), ${passed} passed`); process.exitCode = 1; }
else console.log(`${passed}/${passed} checks passed`);
