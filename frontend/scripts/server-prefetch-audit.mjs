import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'lib/prefetch.ts'), 'utf8');

assert.match(source, /AbortSignal\.timeout\(SERVER_FETCH_TIMEOUT_MS\)/,
  'Server prefetch requests must have a hard timeout.');
assert.match(source, /type ServerFetchOptions[\s\S]*?cache\?: 'no-store'/,
  'Server fetch helper must support explicit no-store requests.');
assert.match(source, /serverFetch<Ad>\(`\/ads\/\$\{encodeURIComponent\(id\)\}`, \{ cache: 'no-store' \}\)/,
  'Ad detail server fetch must bypass the extra Next Data Cache layer.');
assert.match(source, /const fetchAdDetailCached = cache\(/,
  'Ad detail request deduplication must use React request-scoped cache.');
assert.doesNotMatch(source, /new Map<string, Promise<Ad>>\(\)/,
  'Ad detail fetches must not be deduplicated through process-global state.');
assert.match(source, /payload as Record<string, unknown>\)\.success !== true/,
  'Server fetch must validate the API response envelope before casting.');

console.log('Server prefetch audit: 6/6 checks passed');
