#!/usr/bin/env node
// Static guard for IndexedDB connection hygiene in the offline queue and caches.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const sw = read('public/sw.js');
const fn = (name) => { const i = sw.indexOf(`function ${name}(`); return i < 0 ? '' : sw.slice(i, i + 1600); };
for (const name of ['getAllQueuedEntries', 'getQueuedEntry', 'deleteQueuedEntry', 'markQueuedEntry', 'queueRequestEntry']) {
  check(`sw.js ${name} closes its connection`, /finally\s*\{[^}]*db\.close\(\)/.test(fn(name)));
}
check('sw.js deleteQueuedEntry settles on abort (no wedged replay)', /tx\.onabort\s*=/.test(fn('deleteQueuedEntry')));
check('sw.js queue DB releases connection on versionchange', /db\.onversionchange\s*=/.test(fn('openQueueDb')));
check('sw.js overlapping CLEAR_QUEUE uses a depth counter', /queueClearDepth \+= 1/.test(sw) && /if \(queueClearDepth === 0\) queueClearInFlight = false/.test(sw));

check('401 retry never persists the refreshed Bearer into IndexedDB', !/headers: updatedHeaders/.test(sw) && /const updatedEntry = await getQueuedEntry\(entry\.id\)/.test(sw));
check('retryable-http keeps the persisted Retry-After gate', /\.\.\.\(result === 'retryable-http' \? \{\} : \{ retryNotBefore: 0 \}\)/.test(sw));

const q = read('lib/offlineQueue.ts');
check('offlineQueue.getAllEntries closes its connection', /async function getAllEntries[\s\S]*?finally\s*\{[^}]*db\.close\(\)/.test(q));
check('offlineQueue.clearQueueDirectly closes its connection', /async function clearQueueDirectly[\s\S]*?finally\s*\{[^}]*db\.close\(\)/.test(q));
check('queued-operation helpers are scoped to the current owner', (q.match(/e\.ownerUserId !== userId/g) || []).length >= 2);

const mq = read('lib/offlineMessagesQueue.ts');
check('offlineMessagesQueue.getAllRawEntries closes its connection', /async function getAllRawEntries[\s\S]*?finally\s*\{[^}]*db\.close\(\)/.test(mq));

const qc = read('lib/offlineQueryCache.ts');
check('query-cache localStorage marker writes are guarded', /function writeLastCacheMarker[\s\S]*?try \{[\s\S]*?catch/.test(qc) && !/localStorage\.setItem\(LAST_CACHE_AT_KEY/.test(qc.replace(/function writeLastCacheMarker[\s\S]*?\n\}/, '')));

const sp = read('lib/offlineStoragePressure.ts');
check('storage pressure does not await raw serviceWorker.ready', !/await navigator\.serviceWorker\.ready/.test(sp) && /getActiveSW/.test(sp));

const ws = read('lib/offlineWarmingState.ts');
check('warming state does not cache a failed IDB open', /dbPromise\.catch\(\(\) => \{ dbPromise = null; \}\)/.test(ws) && /db\.onclose/.test(ws));

for (const f of ['lib/offlineAdDrafts.ts', 'lib/offlineMessagesStore.ts', 'lib/offlineMessagesQueue.ts', 'lib/conversationMediaStore.ts']) {
  check(`${f} openers release on versionchange`, /onversionchange/.test(read(f)));
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
