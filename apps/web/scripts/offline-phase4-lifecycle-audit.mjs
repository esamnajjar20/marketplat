import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lifecycle = read('lib/networkLifecycle.ts');
const onlineHook = read('hooks/useOnlineStatus.ts');
const policy = read('lib/networkPolicy.ts');
const sw = read('public/sw.js');
const swReady = read('lib/swReady.ts');
const cacheVersion = read('lib/cacheVersion.ts');
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(lifecycle.includes("window.addEventListener('online', handleOnline)") && lifecycle.includes("window.addEventListener('offline', handleOffline)"), 'Lifecycle hub must own online/offline listeners');
check(lifecycle.includes("window.addEventListener('pageshow', handleResume)") && lifecycle.includes("'controller-change'"), 'Lifecycle hub must cover resume and Service Worker controller changes');
check(onlineHook.includes('subscribeOnlineStatus') && !onlineHook.includes("addEventListener('online'"), 'useOnlineStatus must consume the shared lifecycle hub');
check(policy.includes('subscribeNetworkLifecycle') && !policy.includes("window.addEventListener('online'"), 'networkPolicy must consume the shared lifecycle hub');
check(sw.includes("type === 'GET_SW_STATUS'") && sw.includes('cacheVersion: CACHE_VERSION'), 'Service Worker must answer a versioned health handshake');
check(swReady.includes('getServiceWorkerStatus') && swReady.includes("value?.type === 'SW_STATUS'"), 'Client handshake must validate response shape');
const swVersion = sw.match(/const CACHE_VERSION = '(v\d+)';/)?.[1];
const tsVersion = cacheVersion.match(/export const SW_CACHE_VERSION = '(v\d+)'/)?.[1];
check(Boolean(swVersion) && swVersion === tsVersion, `Service Worker/cache version mismatch (${swVersion ?? 'missing'} vs ${tsVersion ?? 'missing'})`);

if (failures.length) {
  console.error(`Offline phase 4 audit failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Offline phase 4 lifecycle audit passed (7 checks).');
}
