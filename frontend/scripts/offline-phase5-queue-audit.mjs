/** Dependency-free guardrails for offline mutation queue replay and recovery. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sw = read('public/sw.js');
const client = read('api/client.ts');
const operationId = read('lib/offlineOperationId.ts');
const tests = read('__tests__/unit/lib/sw.test.ts');
const queue = read('lib/offlineQueue.ts');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('processing lease has a bounded expiry', sw.includes('QUEUE_PROCESSING_LEASE_MS = 2 * 60_000') && sw.includes('processingStartedAt'));
check('drain skips actively processed entries', sw.includes('if (hasActiveProcessingLease(entry)) continue;'));
check('stale/legacy processing entries are recovered', sw.includes('stale lease left by a terminated worker') && sw.includes("processingStartedAt: null"));
check('replay lock remains in place', sw.includes('if (queueClearInFlight || replayQueueInFlight) return;'));
check('manual retry is owner-scoped', sw.includes('event.data.ownerUserId !== entry.ownerUserId'));
check('cancelled entries are excluded from automatic replay', sw.includes("entry.status === 'failed' || entry.status === 'cancelled'"));
check('supported creates receive a stable operation id at request boundary', client.includes('supportsOfflineOperationId(method, config.url ?? \'\')') && client.includes('newOfflineOperationId()'));
check('operation id fallback is unique per generated attempt', operationId.includes('crypto.randomUUID') && operationId.includes('Math.random()'));
check('queue stores operation ids separately for UI correlation', sw.includes('const operationId =') && sw.includes('operationId,') && queue.includes('operationId?: string | null'));
check('backoff and retry caps remain enforced', sw.includes('Math.pow(2, Math.max(0, retries - 1))') && sw.includes('MAX_QUEUE_SERVER_RETRIES'));
check('regression tests cover live and stale processing leases', tests.includes('live processing lease') && tests.includes('stale or legacy processing marker'));

for (const item of checks) console.log(`[offline-phase5] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase5] PASS ${checks.length} checks`);
