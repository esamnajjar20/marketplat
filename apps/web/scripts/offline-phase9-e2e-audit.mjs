/** Dependency-free guardrails for the Phase 9 browser integration test. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const spec = read('e2e/tests/offline-phase9-queue-isolation.spec.ts');
const sw = read('public/sw.js');
const pkg = JSON.parse(read('package.json'));
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

check('uses real Playwright browser and service worker, without module mocks', spec.includes("from '@playwright/test'") && !spec.includes('vi.mock('));
check('waits for active service worker control before going offline', spec.includes('navigator.serviceWorker.ready') && spec.includes('navigator.serviceWorker.controller') && spec.includes('context.setOffline(true)'));
check('uses an allow-listed create endpoint and explicit operation id', spec.includes("fetch('/api/v1/ads'") && spec.includes("'x-offline-op-id': operationId") && sw.includes("/(ads|products|service-listings|requests|service-requests)$/i"));
check('asserts queue acceptance response', spec.includes('expect(response.status).toBe(202)') && spec.includes('expect(response.body.queued).toBe(true)'));
check('asserts stable operation identity is persisted', spec.includes('row.operationId === operationId') && spec.includes('expect(queued[0].operationId).toBe(OP_ID)'));
check('asserts owner binding is persisted', spec.includes('expect(queued[0].ownerUserId).toBe(OWNER_ID)'));
check('asserts bearer credentials are not persisted in queue headers', spec.includes('expect(queued[0].needsAuth).toBe(true)') && spec.includes("not.toContain('authorization')") && sw.includes("if (lower === 'authorization')"));
check('restores online state in finally', spec.includes('finally {') && spec.includes('await context.setOffline(false)'));
check('cleans only the row created by this test', spec.includes('queuedId !== null') && spec.includes('tx.objectStore(queueName).delete(id)') && spec.includes('const queueName = db.objectStoreNames.contains(\'requests\')') && !spec.includes('CLEAR_QUEUE'));
check('phase 9 audit command is registered', pkg.scripts['offline:phase9-e2e-audit'] === 'node scripts/offline-phase9-e2e-audit.mjs');

for (const item of checks) console.log(`[offline-phase9] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase9] PASS ${checks.length} checks`);
