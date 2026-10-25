import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = new URL('../src/storage/', import.meta.url);
const sync = fs.readFileSync(new URL('outbox-sync.ts', base), 'utf8');
const lifecycle = fs.readFileSync(new URL('outbox-sync-lifecycle.ts', base), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const token of ['let activeSync:', 'if (activeSync) return activeSync;', 'activeSync = work;', 'if (activeSync === work) activeSync = null;']) {
  assert.ok(sync.includes(token), `Phase 31 single-flight contract missing: ${token}`);
}
for (const token of ['AppState.addEventListener', "state === 'active'", 'subscribeConnectivity', 'options.getSnapshot()', 'appStateSubscription.remove()', 'unsubscribeConnectivity();', 'stopped = true;']) {
  assert.ok(lifecycle.includes(token), `Phase 31 lifecycle contract missing: ${token}`);
}
assert.ok(pkg.scripts.test.includes('verify-phase31.mjs'), 'Phase 31 verifier must be included in npm test');
console.log('Phase 31 lifecycle and single-flight checks passed (static source checks only).');
