import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const persistence = await readFile(new URL('../src/storage/persist-ad-image.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/storage/mutation-outbox.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Source-contract tests for conservative image-reference handling. Unknown/malformed
// create/update payloads must not be treated as proof that an image is unused.
assert.match(persistence, /operation\.operation === 'delete-ad'\) continue/);
assert.match(persistence, /if \(!payload \|\| typeof payload !== 'object' \|\| !Array\.isArray\(\(payload as \{ images\?: unknown \}\)\.images\)\) \{\s*return 'retained';/);
assert.match(persistence, /images\.some\(\(image\) => !image \|\| typeof image !== 'object' \|\| typeof \(image as \{ uri\?: unknown \}\)\.uri !== 'string'\)/);
assert.match(persistence, /const referenced = images\.some\(\(image\) => \(image as \{ uri: string \}\)\.uri === uri\)/);
assert.match(persistence, /malformed retained operation is not evidence that this file is unused/);
assert.match(outbox, /operation: OutboxOperation/);
assert.ok(pkg.scripts.test.includes('verify-phase49.mjs'));
console.log('Phase 49 conservative outbox image-reference guards passed (static source-contract checks only).');
