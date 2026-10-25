#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sw = read('public/sw.js');
const pwa = read('lib/pwa.ts');
const stale = read('lib/swStaleActivation.ts');
const safety = read('lib/swUpdateSafety.ts');
const checks = [
  ['service worker update discovery bypasses HTTP cache', /updateViaCache:\s*'none'/.test(pwa)],
  ['install does not force skipWaiting', !/addEventListener\(['"]install['"][\s\S]{0,2500}skipWaiting\s*\(/.test(sw)],
  ['waiting worker activation is message-driven', /type === 'SKIP_WAITING'[\s\S]{0,120}self\.skipWaiting\(\)/.test(sw)],
  ['activate migrates cache entries before deleting old caches', sw.indexOf('await migrateDataCaches(cacheNames)') < sw.indexOf('.map((name) => caches.delete(name))') && sw.indexOf('await migrateShellCaches(cacheNames)') < sw.indexOf('.map((name) => caches.delete(name))')],
  ['offline activation does not trigger an immediate document reload', /if \(typeof navigator !== 'undefined' && navigator\.onLine === false\)[\s\S]{0,260}deferredOnlineReload/.test(pwa)],
  ['controllerchange and fallback share guarded reload path', /addEventListener\('controllerchange',[\s\S]{0,300}reloadAfterServiceWorkerChange\(\)/.test(pwa) && /if \(updateReloadInProgress\) return/.test(pwa)],
  ['automatic update checks are skipped while offline', /function checkServiceWorkerUpdate[\s\S]{0,260}navigator\.onLine === false\) return/.test(pwa)],
  ['automatic update application checks shared active-editing state', pwa.includes('isUserBusyForServiceWorkerUpdate()') && /data-draft-open="true"/.test(safety)],
  ['busy state defers auto-apply instead of reloading immediately', /if \(isUserBusyForServiceWorkerUpdate\(\)\) \{[\s\S]{0,300}PWA_BUSY_RETRY_MS/.test(pwa)],
  ['stale waiting worker checks shared busy state before activation', /if \(isUserBusyForServiceWorkerUpdate\(\)\) return;[\s\S]{0,120}postMessage\(\{ type: 'SKIP_WAITING' \}\)/.test(stale) && safety.includes("tag === 'SELECT'")],
  ['stale waiting worker does not auto-activate offline', /function evaluate\([\s\S]{0,500}navigator\.onLine === false\) return/.test(stale)],
];
let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
console.log(`SW lifecycle resilience audit: ${checks.length - failures}/${checks.length} passed`);
if (failures) process.exitCode = 1;
