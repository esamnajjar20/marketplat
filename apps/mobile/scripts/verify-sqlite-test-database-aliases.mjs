import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'src/storage/__tests__/chat-message-outbox.test.ts',
  'src/storage/__tests__/mutation-outbox.test.ts',
];
for (const file of files) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /openEncryptedDatabaseAsync:\s*async\s*\(\)\s*=>\s*\(await mock\)\.openDatabaseAsync\('marketplat-private-v2\.db'\)/,
    `${file}: mock must use the same encrypted database name as its raw test handle`);
  assert.doesNotMatch(source, /getRawDb\('marketplat-public-cache\.db'\)/,
    `${file}: raw assertions must not inspect a different, unopened database`);
  assert.match(source, /getRawDb\('marketplat-private-v2\.db'\)/,
    `${file}: raw SQL assertions must target the database opened by the mock`);
}
console.log('PASS: SQLite outbox tests inspect the same mock database their storage adapters open.');
