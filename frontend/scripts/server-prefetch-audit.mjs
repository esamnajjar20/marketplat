import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefetch = await readFile(path.join(root, 'lib/prefetch.ts'), 'utf8');
const serverFetch = await readFile(path.join(root, 'lib/server/serverApiFetch.ts'), 'utf8');
const tags = await readFile(path.join(root, 'lib/server/serverCacheTags.ts'), 'utf8');

assert.match(serverFetch, /unstable_cache\(/,
  'Public server API reads must use Next Data Cache with an explicit policy.');
assert.match(serverFetch, /tags,\s*\}/,
  'The shared server fetcher must attach invalidation tags to public cache entries.');
assert.match(serverFetch, /getCloudflareContext\(\)/,
  'Cloudflare SSR must resolve the API_WORKER Service Binding.');
assert.match(serverFetch, /API_WORKER service binding is unavailable/,
  'Cloudflare SSR must fail closed rather than falling back to workers.dev when the binding is missing.');
assert.match(serverFetch, /const requestApiEnvelope = cache\(/,
  'Read requests must use React request-scoped deduplication.');
assert.match(serverFetch, /mode: 'no-store'/,
  'The shared reader must support explicit no-store requests.');
assert.match(serverFetch, /\.success !== true/,
  'Server fetch must validate the API response envelope before casting.');
assert.match(prefetch, /fetchServerApi<Ad>\(`\/ads\/\$\{encodeURIComponent\(id\)\}`, \{ mode: 'no-store' \}\)/,
  'Ad detail reads that increment views must bypass the Next Data Cache.');
assert.match(tags, /route:ads[\s\S]*route:products[\s\S]*route:service-listings/,
  'The shared Next cache vocabulary must cover the public browse domains.');

console.log('Server prefetch audit: 9/9 checks passed');
