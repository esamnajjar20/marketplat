import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFile(resolve(repoRoot, path), 'utf8');

test('shared pagination bounds match the Express API', async () => {
  const [shared, api] = await Promise.all([
    read('packages/contracts/src/pagination.ts'),
    read('apps/api/src/shared/utils/pagination.ts'),
  ]);
  assert.match(shared, /numericQuery\(1000\)/);
  assert.match(shared, /numericQuery\(100\)/);
  assert.match(api, /max\(1000\)/);
  assert.match(api, /max\(100\)/);
  assert.match(shared, /hasNextPage: z\.boolean\(\)\.optional\(\)/);
  assert.match(shared, /hasPrevPage: z\.boolean\(\)\.optional\(\)/);
  assert.match(shared, /nextCursor: z\.string\(\)\.nullable\(\)\.optional\(\)/);
});

test('mobile response validation accepts all server pagination metadata fields', async () => {
  const mobile = await read('apps/mobile/src/api/response-schemas.ts');
  for (const field of ['page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPrevPage', 'nextCursor']) {
    assert.match(mobile, new RegExp(`${field}: z\\.`), `mobile pagination schema must accept ${field}`);
  }
});

test('shared API envelopes retain the fields emitted by Express error middleware', async () => {
  const [shared, api] = await Promise.all([
    read('packages/contracts/src/api-response.ts'),
    read('apps/api/src/shared/errors/errorResponse.ts'),
  ]);
  for (const field of ['statusCode', 'code', 'requestId', 'meta', 'errors', 'errorMeta']) {
    assert.match(shared, new RegExp(`${field}:`), `shared error contract must include ${field}`);
    assert.match(api, new RegExp(`${field}\\??:`), `Express error response must include ${field}`);
  }
});

test('web and mobile pagination types expose the same navigation flags', async () => {
  const [web, mobile] = await Promise.all([
    read('frontend/types/api.types.ts'),
    read('apps/mobile/src/lib/pagination.ts'),
  ]);
  for (const field of ['hasNextPage', 'hasPrevPage', 'nextCursor']) {
    assert.match(web, new RegExp(`${field}\\??:`));
  }
  for (const field of ['hasNextPage', 'hasPrevPage', 'nextCursor']) {
    assert.match(mobile, new RegExp(`${field}\\??:`));
  }
});
