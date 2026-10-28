#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sw = readFileSync(resolve('public/sw.js'), 'utf8');
const version = readFileSync(resolve('lib/cacheVersion.ts'), 'utf8');
const checks = [
  ['service worker and TypeScript cache versions are synchronized', (sw.match(/const CACHE_VERSION = '(v\d+)';/) || [])[1] !== undefined && (sw.match(/const CACHE_VERSION = '(v\d+)';/) || [])[1] === (version.match(/SW_CACHE_VERSION = '(v\d+)'/) || [])[1]],
  ['quota pressure adapts limits for per-user data', /cacheName\.startsWith\(USER_DATA_CACHE_PREFIX\)/.test(sw) && /factor = 0\.50/.test(sw) && /factor = 0\.60/.test(sw) && /factor = 0\.75/.test(sw)],
  ['quota pressure trims static shell within a bounded ratio', /cacheName === STATIC_CACHE/.test(sw) && /factor = 0\.70/.test(sw) && /factor = 0\.80/.test(sw)],
  ['personal shell has a separate pressure tier', /cacheName === PERSONAL_SHELL_CACHE/.test(sw) && /factor = 0\.75/.test(sw) && /factor = 0\.85/.test(sw)],
  ['API and images remain first disposable targets', /cacheName === API_CACHE \|\| cacheName === IMAGE_CACHE/.test(sw) && /factor = 0\.20/.test(sw)],
  ['explicitly saved ads keep highest eviction priority', /if \(cacheName\.includes\('saved-ads'\)\) return 200/.test(sw)],
  ['visited page and permanent shell scoring remains enabled', /visit-asset/.test(sw) && /permanentBonus/.test(sw) && /isPermanentShellKey\(key, cacheName\)/.test(sw)],
  ['quota estimate remains guarded for unsupported browsers', /navigator\.storage\?\.estimate\?\.\(\)/.test(sw)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`SW storage pressure audit: ${checks.length - failed}/${checks.length} passed`);
if (failed) process.exitCode = 1;
