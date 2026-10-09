/** Dependency-free guardrails for the shared offline storage contract. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const adapter = read('lib/browserStorage.ts');
const localStore = read('lib/localStore.ts');
const envelope = read('lib/offlineCacheEnvelope.ts');
const jsonCache = read('lib/offlineJsonCache.ts');
const listCache = read('lib/offlineListCache.ts');
const adapterTests = read('__tests__/unit/lib/browserStorage.test.ts');
const storeTests = read('__tests__/unit/lib/localStore.test.ts');
const envelopeTests = read('__tests__/unit/lib/offlineCacheEnvelope.test.ts');

check('browser storage property access is guarded', adapter.includes('try {') && adapter.includes('window.sessionStorage') && adapter.includes('window.localStorage'));
check('JSON serialization failures return a safe failure value', adapter.includes('JSON.stringify(value)') && adapter.includes("typeof serialized === 'string' ? serialized : null"));
check('localStore uses shared guarded storage and serialization adapter', localStore.includes("from '@/lib/browserStorage'") && localStore.includes('safeStorageGet') && localStore.includes('safeStorageSet') && localStore.includes('serializeStorageValue'));
check('offline JSON and list caches use one envelope implementation', jsonCache.includes('saveOfflineEnvelope') && jsonCache.includes('getOfflineEnvelope') && listCache.includes('saveOfflineEnvelope') && listCache.includes('getOfflineEnvelope'));
check('shared envelope validates timestamp, payload shape, and owner scope', envelope.includes('isOfflineHardExpired(savedAt)') && envelope.includes("field === 'items' && !Array.isArray(raw.items)") && envelope.includes('(raw.userId ?? null) !== (userId ?? null)'));
check('adapter tests cover unavailable storage and serialization failures', adapterTests.includes('fails closed when browser storage throws') && adapterTests.includes('cannot serialize'));
check('localStore tests cover malformed JSON and failed writes', storeTests.includes('malformed JSON') && storeTests.includes('write failure'));
check('envelope tests cover ownership and malformed records', envelopeTests.includes('different user') && envelopeTests.includes('invalid timestamps') && envelopeTests.includes('non-array list payloads'));

for (const item of checks) console.log(`[offline-phase3] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase3] PASS ${checks.length} checks`);
