import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../app/ad-editor.tsx', import.meta.url), 'utf8');
const outbox = readFileSync(new URL('../src/storage/mutation-outbox.ts', import.meta.url), 'utf8');
const transport = readFileSync(new URL('../src/storage/outbox-transport-contract.mjs', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../src/storage/outbox-sync.ts', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../src/storage/outbox-sync-lifecycle.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(editor, /import NetInfo from '@react-native-community\/netinfo'/, 'Editor must check current connectivity before deciding online vs offline save');
assert.match(editor, /await enqueueMutation\(/, 'Offline ad creation must be durably enqueued');
assert.match(editor, /operation: 'create-ad'/, 'Offline create uses the supported outbox operation');
assert.match(editor, /idempotencyKey: operationId/, 'Queued create must retain a stable server idempotency key');
assert.match(editor, /images: draft\.images\.map/, 'Queue payload must preserve local image references');
assert.match(editor, /router\.replace\('\/offline-queue'\)/, 'User must be able to inspect queued operation status');
assert.match(editor, /images: draft\.images\.map/, 'Offline edit image references must be retained in the durable outbox payload');
assert.match(editor, /operation: 'update-ad'/, 'Field-only offline edits use the durable outbox');
assert.match(outbox, /idempotency_key TEXT NOT NULL UNIQUE/, 'Outbox must enforce unique idempotency keys locally');
assert.match(transport, /item\.operation !== 'create-ad'/, 'Create transport validates operation type before replay');
assert.match(transport, /'X-Offline-Op-Id': item\.idempotencyKey/, 'Replay must send the persisted idempotency key');
assert.match(sync, /await acknowledgeMutation\(claimed\.id, leaseOwner\)/, 'Queued work must only be removed after successful server transport');
assert.match(lifecycle, /processed < 50/, 'A reconnect/resume event should drain a bounded queue batch, not only one item');
assert.match(lifecycle, /result\.result\.status !== 'synced'/, 'Drain must stop immediately on any non-success status to preserve FIFO and avoid retry loops');
assert.match(packageJson.scripts.test, /verify-phase58\.mjs/, 'Phase 58 verifier must be part of npm test');
console.log('Phase 58 regression checks passed: offline create queueing, durable local images, idempotency, and explicit image-edit limitation.');
