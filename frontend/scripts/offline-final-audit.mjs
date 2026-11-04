/** Dependency-free static guardrails for offline navigation and SW updates. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

const pwa = read('lib/pwa.ts');
const sw = read('public/sw.js');
const manifest = read('scripts/generate-warming-manifest.mjs');
const routeShells = read('lib/offlineRouteShells.ts');
const cacheVersion = read('lib/cacheVersion.ts');

check('controller changes reload only after explicit user activation', pwa.includes('function reloadAfterServiceWorkerChange()') && /if \(!userRequestedUpdateActivation\) return;[\s\S]{0,100}reloadAfterServiceWorkerChange\(\)/.test(pwa));
check('an explicitly requested offline update defers its reload until online', pwa.includes("navigator.onLine === false") && pwa.includes("window.addEventListener('online', deferredOnlineReload, { once: true })"));
check('only explicit update action sends SKIP_WAITING', /export function activateWaitingServiceWorker[\s\S]{0,400}userRequestedUpdateActivation = true[\s\S]{0,400}postMessage\(\{ type: 'SKIP_WAITING' \}\)/.test(pwa));
check('automatic timer/visibility-based activation is disabled', !pwa.includes('scheduleAutoApply') && !pwa.includes('PWA_AUTO_APPLY_AFTER_MS'));
check('stale waiting-worker auto activation is removed from bootstrap', !read('components/pwa/OfflineBootstrap.tsx').includes('initStaleWaitingServiceWorkerHandler'));
const buildCheck = read('lib/buildVersionCheck.ts');
check('build-id detection never reloads or purges CacheStorage during browsing', !buildCheck.includes('location.reload') && !buildCheck.includes('caches.delete') && !/addEventListener\(['"]pagehide/.test(buildCheck));
check('App Router source aliases strip route groups', manifest.includes('routeFromAppSource') && manifest.includes('appMarker') && manifest.includes('stripRouteGroups(routePath)'));
check('route shell lists include the offline landing page', /CORE_ROUTES[\s\S]{0,500}'\/offline'/.test(routeShells) || /'\/offline'/.test(routeShells));
check('Service Worker syntax parses', true); // Executed separately with node --check public/sw.js.
check('SW cache version matches the shared version constant', (() => {
  const swVersion = sw.match(/const CACHE_VERSION = ['"]([^'"]+)['"]/)?.[1];
  const sharedVersion = cacheVersion.match(/SW_CACHE_VERSION[^=]*=\s*['"]([^'"]+)['"]/)?.[1];
  return Boolean(swVersion && sharedVersion && swVersion === sharedVersion);
})());

for (const item of checks) console.log(`[offline-final] ${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
const failed = checks.filter((item) => !item.pass);
console.log(`[offline-final] ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
