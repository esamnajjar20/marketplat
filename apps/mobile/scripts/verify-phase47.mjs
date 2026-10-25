import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSerializedByKey } from '../src/storage/draft-operation-queue.mjs';

const store = await readFile(new URL('../src/storage/ad-draft-store.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Verify actual queue behavior: same-account work is ordered, separate accounts can progress,
// and a rejected operation does not poison later saves/clears.
const events = [];
let releaseFirst;
const gate = new Promise((resolve) => { releaseFirst = resolve; });
const first = runSerializedByKey('account-a', async () => { events.push('a1-start'); await gate; events.push('a1-end'); return 1; });
const second = runSerializedByKey('account-a', async () => { events.push('a2'); return 2; });
const other = runSerializedByKey('account-b', async () => { events.push('b1'); return 3; });
assert.equal(await other, 3);
assert.deepEqual(events, ['a1-start', 'b1']);
releaseFirst();
assert.deepEqual(await Promise.all([first, second]), [1, 2]);
assert.deepEqual(events, ['a1-start', 'b1', 'a1-end', 'a2']);
await assert.rejects(runSerializedByKey('account-c', async () => { throw new Error('expected'); }), /expected/);
assert.equal(await runSerializedByKey('account-c', async () => 'recovered'), 'recovered');
assert.match(store, /runSerializedByKey\(ownerId, async \(\) =>/);
assert.match(store, /Queue deletion behind any in-flight save/);
assert.ok(pkg.scripts.test.includes('verify-phase47.mjs'));
console.log('Phase 47 serialized draft writes, account isolation, rejection recovery, and clear ordering checks passed.');
