import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const transport = await readFile(new URL('../src/storage/outbox-transport.ts', import.meta.url), 'utf8');
const contract = await readFile(new URL('../src/storage/outbox-transport-contract.mjs', import.meta.url), 'utf8');
const sync = await readFile(new URL('../src/storage/outbox-sync.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/storage/mutation-outbox.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Source-contract checks: verify local image files immediately before upload,
// preserve queue rows on transport failure, and reuse a stable server idempotency key.
assert.match(transport, /import \* as FileSystem from 'expo-file-system\/legacy'/);
assert.match(transport, /async function verifyOutboxImages/);
assert.match(transport, /await FileSystem\.getInfoAsync\(image\.uri, \{ size: true \}\)/);
assert.match(transport, /if \(!info\.exists \|\| info\.isDirectory\)/);
assert.match(transport, /info\.size > MAX_OUTBOX_IMAGE_SIZE_BYTES/);
assert.match(transport, /await verifyOutboxImages\(request\.images\)/);
assert.match(contract, /headers: \{ 'X-Offline-Op-Id': item\.idempotencyKey \}/);
assert.match(sync, /await sendOutboxCreateAd\(claimed, token, csrfToken\)/);
assert.match(sync, /server-succeeded-local-ack-pending/);
assert.match(outbox, /idempotency_key TEXT NOT NULL UNIQUE/);
assert.match(outbox, /same idempotency key/);
assert.ok(pkg.scripts.test.includes('verify-phase50.mjs'));
console.log('Phase 50 pre-upload image existence/size and idempotent retry source-contract checks passed (static only; Expo filesystem/API runtime not exercised).');
