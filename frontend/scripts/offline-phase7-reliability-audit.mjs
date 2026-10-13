/** Dependency-free guardrails for retry classification and duplicate-safe offline operations. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sales = read('lib/sales-offline/salesSync.ts');
const store = read('lib/sales-offline/salesDraftStore.ts');
const queue = read('lib/offlineQueue.ts');
const sw = read('public/sw.js');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['retryable sales errors are classified explicitly', sales.includes('function isRetryableSalesSyncError(error: unknown)')],
  ['network failures remain pending for later retry', sales.includes("e?.code === 'NETWORK_ERROR'") && sales.includes("e?.code === 'OFFLINE_QUEUED'")],
  ['timeouts and rate limits remain retryable', sales.includes('status === 408') && sales.includes('status === 429')],
  ['server errors remain retryable', sales.includes('status >= 500')],
  ['permanent client errors become failed rather than looping forever', sales.includes("isRetryableSalesSyncError(error) ? 'pending' : 'failed'")],
  ['conflicts remain separately actionable', sales.includes("status: conflict ? 'conflict'")],
  ['sales drafts preserve a stable operation id', sales.includes('salesApi.create(draft.payload, draft.operationId)') && store.includes('operationId: string')],
  ['sales draft operation id has a unique IndexedDB index', store.includes("createIndex('operationId', 'operationId', { unique: true })")],
  ['generic queue keeps operation ids for correlation', queue.includes('operationId?: string | null') && queue.includes("safeHeaders['x-offline-op-id'] = operationId")],
  ['service worker enforces bounded retries', sw.includes('MAX_QUEUE_SERVER_RETRIES') && sw.includes('Math.pow(2, Math.max(0, retries - 1))')],
  ['reliability audit is registered in package scripts', pkg.scripts['offline:phase7-reliability-audit'] === 'node scripts/offline-phase7-reliability-audit.mjs'],
];
for (const [name, ok] of checks) console.log(`[phase7-reliability] ${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`[phase7-reliability] PASS ${checks.length} checks`);
