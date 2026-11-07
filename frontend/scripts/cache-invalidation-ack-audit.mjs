import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../lib/offlineCacheInvalidation.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../components/pwa/OfflineBootstrap.tsx', import.meta.url), 'utf8');
const checks = [
  ['client waits for SW acknowledgement', client.includes('INVALIDATE_API_CACHE_DONE') && client.includes('MessageChannel')],
  ['client bounds SW readiness and acknowledgement wait', client.includes('getActiveSW(1_000)') && client.includes('deadline = Date.now() + 1_000') && client.includes('acknowledgement timed out')],
  ['worker acknowledges only after Cache Storage deletion', worker.includes('acknowledge(true, deleted)') && worker.includes('await Promise.all(targetNames.map')],
  ['worker reports invalidation failure', worker.includes('acknowledge(false, 0)')],
  ['offline queue replay awaits invalidation promise handling', bootstrap.includes('invalidateOfflineCachesForMutation(data.url, data.method).catch')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`[cache-invalidation-ack] ${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
else console.log(`[cache-invalidation-ack] ${checks.length}/${checks.length} checks passed`);
