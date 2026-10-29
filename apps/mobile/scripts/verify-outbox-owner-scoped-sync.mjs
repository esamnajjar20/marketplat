import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const storage = path.resolve(here, '../src/storage');
const files = [
  'outbox-sync.ts',
  'request-outbox.ts',
  'request-offer-outbox.ts',
  'order-outbox.ts',
  'entity-create-outbox.ts',
];
for (const name of files) {
  const source = await readFile(path.join(storage, name), 'utf8');
  assert.match(source, /activeSyncByOwner\s*=\s*new Map/, `${name}: coalescing must be scoped by owner`);
  assert.match(source, /activeSyncByOwner\.get\(key\)/, `${name}: must check the owner's active sync`);
  assert.match(source, /activeSyncByOwner\.set\(key, work\)/, `${name}: must register work for the owner`);
  assert.match(source, /activeSyncByOwner\.delete\(key\)/, `${name}: must clear only the owner's completed sync`);
  assert.doesNotMatch(source, /let activeSync:\s*Promise/, `${name}: global activeSync can starve another signed-in account`);
  console.log(`PASS ${name}: concurrent sync coalescing is owner-scoped`);
}
console.log(`PASS all ${files.length} offline outbox workers use owner-scoped sync coalescing`);
