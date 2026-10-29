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
assert.match(pkg.scripts.test, /run-all-verifications\.mjs/, 'npm test must invoke the discovery runner');
assert.match(readFileSync(new URL('./run-all-verifications.mjs', import.meta.url), 'utf8'), /startsWith\('verify-'\)[\s\S]*endsWith\('\.mjs'\)/, 'verification runner must discover scripts/verify-*.mjs files');
console.log('Phase 48 stale-image cleanup guards and editor integration checks passed (static source contract only).');
