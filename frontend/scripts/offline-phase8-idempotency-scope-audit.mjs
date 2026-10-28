/** Static integration guardrails for offline replay idempotency and owner isolation. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.resolve(root, '..');
const read = (file) => fs.readFileSync(path.join(project, file), 'utf8');
const client = read('frontend/api/client.ts');
const id = read('frontend/lib/offlineOperationId.ts');
const middleware = read('backend/src/middlewares/offlineOperationId.middleware.ts');
const app = read('backend/src/app.ts');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const allowlist = client.match(/function supportsOfflineOperationId\(method: string, url: string\): boolean \{([\s\S]*?)\n\}/)?.[1] ?? '';
check('idempotency keys are restricted to POST', /if \(method !== 'post'\) return false/.test(allowlist));
check('request boundary preserves caller-supplied keys', /if \(!headers\[OFFLINE_OP_ID_HEADER\] && !headers\[OFFLINE_OP_ID_HEADER\.toLowerCase\(\)\]\)/.test(client));
check('generated keys use UUID with a compatibility fallback', id.includes('crypto.randomUUID') && id.includes('Math.random()'));
check('backend validates bounded safe idempotency tokens', middleware.includes('OFFLINE_OPERATION_ID_PATTERN') && middleware.includes('1-128 safe characters'));
check('backend installs idempotency validation middleware globally', /app\.use\(offlineOperationIdMiddleware\)/.test(app));
check('CORS permits the idempotency header', /'X-Offline-Op-Id'/.test(app));

const cases = [
  ['ads', 'backend/src/modules/ads/ads.service.ts', 'existing.userId !== userId'],
  ['products', 'backend/src/modules/products/products.service.ts', 'existing.storeId !== store.id'],
  ['service listings', 'backend/src/modules/service-listings/service-listings.service.ts', 'existing.providerId !== provider.id'],
  ['open requests', 'backend/src/modules/requests/requests.service.ts', 'existing.customerId !== customerId'],
  ['service requests', 'backend/src/modules/service-requests/service-requests.service.ts', 'existing.customerId !== customerId'],
  ['sales', 'backend/src/modules/sales/sales.service.ts', 'sellerId: userId, offlineOperationId'],
];
for (const [name, file, ownerGuard] of cases) {
  const source = read(file);
  check(`${name} replay checks operation ID and owner scope`, source.includes('offlineOperationId') && source.includes(ownerGuard));
}

check('browser integration test restores connectivity after offline assertions', read('frontend/e2e/tests/offline-phase8.integration.spec.ts').includes('finally {') && read('frontend/e2e/tests/offline-phase8.integration.spec.ts').includes('await context.setOffline(false)'));
for (const item of checks) console.log(`[offline-phase8-scope] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`[offline-phase8-scope] ${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
