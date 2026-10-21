#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sw = readFileSync(resolve('public/sw.js'), 'utf8');
const version = readFileSync(resolve('lib/cacheVersion.ts'), 'utf8');
const checks = [
  ['cache version synchronized between sw.js and cacheVersion.ts', (sw.match(/const CACHE_VERSION = '(v\d+)';/) || [])[1] !== undefined && (sw.match(/const CACHE_VERSION = '(v\d+)';/) || [])[1] === (version.match(/SW_CACHE_VERSION = '(v\d+)'/) || [])[1]],
  ['reference endpoints use reference hard TTL', /policy\.reference\?\.offline\?\.hardAfterMs/.test(sw)],
  ['recommendations use recommendations hard TTL', /policy\.recommendations\?\.offline\?\.hardAfterMs/.test(sw)],
  ['home endpoints use publicHome hard TTL', /policy\.publicHome\?\.offline\?\.hardAfterMs/.test(sw)],
  ['public detail endpoints use publicDetail hard TTL', /policy\.publicDetail\?\.offline\?\.hardAfterMs/.test(sw)],
  ['unknown/future timestamps are rejected', /cachedAt <= 0 \|\| cachedAt > now \+ 60_000/.test(sw)],
  ['hard TTL is enforced before API cache fallback', /now - cachedAt <= maxAge/.test(sw) && /isFreshCachedApiSnapshot\(url, cachedUserData\)/.test(sw) && /isFreshCachedApiSnapshot\(url, cachedCore\)/.test(sw)],
  ['expired shared and user entries are deleted', /userDataCache\.delete\(request\)/.test(sw) && /lastUserCache\.delete\(request\)/.test(sw) && /coreCache\.delete\(request\.url\)/.test(sw)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`SW API freshness audit: ${checks.length - failed}/${checks.length} passed`);
if (failed) process.exitCode = 1;
