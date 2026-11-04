import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'app/api/admin/gateway/registry/route.ts'), 'utf8');

assert.match(source, /readLimitedJsonBody\(request, maxBytes\)/,
  'Mutating requests must use a bounded streaming JSON reader.');
assert.match(source, /method === 'PUT' \? 65_536 : 1_024/,
  'PUT and POST payloads must have explicit size budgets.');
assert.match(source, /readLimitedResponseText\(response, 16_384\)/,
  'The admin-session response must be bounded before JSON parsing.');
assert.match(source, /readLimitedResponseText\(upstream, 262_144\)/,
  'The upstream registry response must be bounded before buffering.');
assert.match(source, /AbortSignal\.timeout\(5_000\)/,
  'Admin session verification must have a finite timeout.');
assert.match(source, /AbortSignal\.timeout\(10_000\)/,
  'Gateway calls must have a finite timeout.');
assert.match(source, /isSameOriginMutation\(request\)/,
  'Mutations must enforce same-origin CSRF checks.');
assert.match(source, /GATEWAY_ADMIN_TOKEN/,
  'The gateway admin token must remain server-side.');

console.log('Gateway proxy audit: 8/8 checks passed');
