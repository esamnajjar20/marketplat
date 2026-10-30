import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const outbox = await read('src/storage/mutation-outbox.ts');
const sync = await read('src/storage/outbox-sync.ts');
const lifecycle = await read('src/storage/OutboxSyncLifecycleBridge.tsx');
const editor = await read('app/ad-editor.tsx');
const myAds = await read('app/my-ads.tsx');
const queue = await read('app/offline-queue.tsx');
const packageJson = JSON.parse(await read('package.json'));

assert.match(outbox, /owner_id TEXT/);
assert.match(outbox, /ALTER TABLE mutation_outbox ADD COLUMN owner_id TEXT/);
assert.match(outbox, /ownerId: string/);
assert.match(outbox, /WHERE owner_id = \?/);
assert.match(outbox, /countUnownedOutboxMutations/);
assert.match(sync, /getOldestOutboxMutation\(ownerId\)/);
assert.match(sync, /claimMutation\(candidate\.id, leaseOwner, OUTBOX_LEASE_DURATION_MS, ownerId\)/);
assert.match(sync, /if \(!input\.token\?\.trim\(\) \|\| !input\.ownerId\?\.trim\(\)\)/);
assert.match(lifecycle, /ownerId: user\?\.id \?\? null/);
assert.match(editor, /ownerId: String\(user\.id\)/);
assert.match(myAds, /ownerId: String\(user\.id\)/);
assert.match(queue, /listAllOutboxMutations\(user\.id\)/);
assert.match(queue, /discardOutboxMutation\(item\.id, item\.ownerId\)/);
assert.ok(packageJson.scripts.test.includes('verify-feature-phase7.mjs'));

console.log('Phase 7 static checks passed: offline mutations are account-scoped and legacy unowned work fails closed.');
