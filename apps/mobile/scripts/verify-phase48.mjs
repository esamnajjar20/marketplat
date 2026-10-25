import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const persistence = await readFile(new URL('../src/storage/persist-ad-image.ts', import.meta.url), 'utf8');
const editor = await readFile(new URL('../app/ad-editor.tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(persistence, /ORPHAN_IMAGE_MIN_AGE_MS = 24 \* 60 \* 60 \* 1_000/);
assert.match(persistence, /export async function cleanupStaleUnreferencedAdImages/);
assert.match(persistence, /FileSystem\.readDirectoryAsync\(IMAGE_DIRECTORY\)/);
assert.match(persistence, /now - info\.modificationTime \* 1_000 < minimumAgeMs/);
assert.match(persistence, /removePersistedAdImageIfUnused\(uri\)/);
assert.match(persistence, /catch \{\s*\/\/ Storage errors must never cause the app to delete by an alternate path\./);
assert.match(editor, /useEffect\(\(\) => \{ void cleanupStaleUnreferencedAdImages\(\)\.catch\(\(\) => undefined\); \}, \[\]\)/);
assert.ok(pkg.scripts.test.includes('verify-phase48.mjs'));
console.log('Phase 48 stale-image cleanup guards and editor integration checks passed (static source contract only).');
