#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sw = read('public/sw.js');
const pwa = read('lib/pwa.ts');
const stale = read('lib/swStaleActivation.ts');
const checks = [
  ['service worker update discovery bypasses HTTP cache', /updateViaCache:\s*'none'/.test(pwa)],
  ['install does not force skipWaiting', !/addEventListener\(['"]install['"][\s\S]{0,2500}skipWaiting\s*\(/.test(sw)],
  ['waiting worker activation remains message-driven', /type === 'SKIP_WAITING'[\s\S]{0,120}self\.skipWaiting\(\)/.test(sw)],
  ['only explicit user action may request worker activation', /userRequestedUpdateActivation = true[\s\S]{0,600}postMessage\(\{ type: 'SKIP_WAITING' \}\)/.test(pwa)],
  ['unsolicited controller changes cannot reload the document', /if \(!userRequestedUpdateActivation\) return;[\s\S]{0,120}reloadAfterServiceWorkerChange\(\)/.test(pwa)],
  ['automatic timer and visibility activation are disabled', !pwa.includes('scheduleAutoApply') && !pwa.includes('PWA_AUTO_APPLY_AFTER_MS')],
  ['stale waiting-worker auto-activation is a no-op', !/postMessage\(\{ type: 'SKIP_WAITING' \}\)/.test(stale) && /Intentionally empty/.test(stale)],
  ['offline bootstrap no longer initializes stale auto-activation', !read('components/pwa/OfflineBootstrap.tsx').includes('initStaleWaitingServiceWorkerHandler')],
  ['activate migrates cache entries before deleting old caches', sw.indexOf('await migrateDataCaches(cacheNames)') < sw.indexOf('.map((name) => caches.delete(name))') && sw.indexOf('await migrateShellCaches(cacheNames)') < sw.indexOf('.map((name) => caches.delete(name))')],
  ['automatic update checks are skipped while offline', /function checkServiceWorkerUpdate[\s\S]{0,260}navigator\.onLine === false\) return/.test(pwa)],
  ['build-id detection does not interrupt or purge the active session', !read('lib/buildVersionCheck.ts').includes('location.reload') && !read('lib/buildVersionCheck.ts').includes('caches.delete')],
];
let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
console.log(`SW lifecycle resilience audit: ${checks.length - failures}/${checks.length} passed`);
if (failures) process.exitCode = 1;
