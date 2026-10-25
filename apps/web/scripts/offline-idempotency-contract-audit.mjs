/** Static contract checks for stable operation IDs on backend-idempotent POSTs. */
import fs from 'node:fs';

const client = fs.readFileSync('api/client.ts', 'utf8');
const queue = fs.readFileSync('public/sw.js', 'utf8');
const ids = fs.readFileSync('lib/offlineOperationId.ts', 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const allowlist = client.match(/function supportsOfflineOperationId\(method: string, url: string\): boolean \{([\s\S]*?)\n\}/)?.[1] ?? '';
check('operation IDs are only generated for POST requests', /if \(method !== 'post'\) return false/.test(allowlist));
check('ads create has stable operation-ID coverage', /\^\\\/ads\$/.test(allowlist));
check('products create has stable operation-ID coverage', /\^\\\/products\$/.test(allowlist));
check('service listings create has stable operation-ID coverage', /\^\\\/service-listings\$/.test(allowlist));
check('open requests create has stable operation-ID coverage', /\^\\\/requests\$/.test(allowlist));
check('service requests create has stable operation-ID coverage', /\^\\\/service-requests\$/.test(allowlist));
check('sales create has stable operation-ID coverage', /\^\\\/sales\$/.test(allowlist));
check('Axios boundary preserves a caller-supplied operation ID', /if \(!headers\[OFFLINE_OP_ID_HEADER\] && !headers\[OFFLINE_OP_ID_HEADER\.toLowerCase\(\)\]\)\s*\{\s*headers\[OFFLINE_OP_ID_HEADER\] = newOfflineOperationId\(\);/.test(client));
check('operation ID header remains stable in queued entry metadata', /headers\['x-offline-op-id'\] \|\| headers\['X-Offline-Op-Id'\]/.test(queue));
check('replay sanitization does not classify operation ID as an identity secret', !/['\"]x-offline-op-id['\"]/.test(queue.match(/const QUEUE_STRIP_HEADERS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? ''));
check('operation ID generator has UUID and fallback paths', ids.includes('crypto.randomUUID') && ids.includes('Math.random()'));

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`\n${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
