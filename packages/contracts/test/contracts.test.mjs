import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// These dependency-free guardrails keep the initial contract package discoverable
// even before pnpm has been installed and Zod runtime tests can run.
test('contract package exports the current API envelopes and pagination primitives', async () => {
  const index = await readFile(resolve(root, 'src/index.ts'), 'utf8');
  const api = await readFile(resolve(root, 'src/api-response.ts'), 'utf8');
  const pagination = await readFile(resolve(root, 'src/pagination.ts'), 'utf8');
  assert.match(index, /api-response/);
  assert.match(index, /pagination/);
  assert.match(api, /success: z\.literal\(true\)/);
  assert.match(api, /success: z\.literal\(false\)/);
  assert.match(api, /statusCode: z\.number\(\)\.int\(\)\.min\(400\)/);
  assert.match(api, /errorMeta/);
  assert.match(pagination, /max\(100\)/);
  assert.match(pagination, /totalPages/);
});
