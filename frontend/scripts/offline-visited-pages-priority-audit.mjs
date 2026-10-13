#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(frontend, p), 'utf8');
const sw = read('public/sw.js');
const versions = read('lib/cacheVersion.ts');
const authCleanup = read('lib/authCleanup.ts');
const routeShells = read('lib/offlineRouteShells.ts');
const failures = []; let passed = 0;
const check = (name, ok) => { if (ok) { passed++; console.log(`[visited-pages] PASS ${name}`); } else { failures.push(name); console.error(`[visited-pages] FAIL ${name}`); } };
check('protected real visits use a personal shell cache', /function isPersonalShellRoute\(url\)[\s\S]*?return isProtectedPage\(url\);/.test(sw));
check('admin and ad-edit routes remain excluded', /if \(PROTECTED_AD_EDIT_RE\.test\(path\)\) return false;[\s\S]{0,150}if \(path === '\/admin' \|\| path\.startsWith\('\/admin\/'\)\) return false;/.test(sw));
check('visited HTML is marked with visit source metadata', /putTimestamped\(htmlCache, cacheKey, await stripVaryAndClone\(response\), 'visit'\)/.test(sw));
check('warm-up keeps newer real visits', /isFreshVisitCopy\(existingVisitAt, priorWarmedAt\)/.test(routeShells) && /keepLatestVisit = keepVisitedCopy \|\| isFreshVisitCopy/.test(routeShells));
check('personal cache is removed during logout cleanup', /n\.startsWith\('market-personal-shell-'\)/.test(authCleanup));
check('public visits still use network-first page handling', /return networkFirstPage\(event, request, cacheKey\)/.test(sw));
const swVersion = sw.match(/const CACHE_VERSION = '(v\d+)'/)?.[1];
const tsVersion = versions.match(/SW_CACHE_VERSION = '(v\d+)'/)?.[1];
check('service-worker and TypeScript cache versions match', Boolean(swVersion) && swVersion === tsVersion);
if (failures.length) { console.error(`${failures.length} failed; ${passed} passed`); process.exit(1); }
console.log(`[visited-pages] ${passed}/${passed} checks passed`);
