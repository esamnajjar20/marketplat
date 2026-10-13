#!/usr/bin/env node
/** Focused static regression audit for offline queue failure resilience. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const sw = fs.readFileSync(path.join(frontend, 'public/sw.js'), 'utf8');
const cacheVersion = fs.readFileSync(path.join(frontend, 'lib/cacheVersion.ts'), 'utf8');
const queueLib = fs.readFileSync(path.join(frontend, 'lib/offlineQueue.ts'), 'utf8');
const checks = [];
const pass = (name, condition) => {
  checks.push({ name, passed: Boolean(condition) });
  console.log(`[offline-queue-resilience] ${condition ? 'PASS' : 'FAIL'} ${name}`);
};

const drainStart = sw.indexOf('async function replayQueue()');
const drainEnd = sw.indexOf('async function replayQueueImpl', drainStart);
const drain = drainStart >= 0 && drainEnd > drainStart ? sw.slice(drainStart, drainEnd) : '';
pass('replay lock is released from a finally block', /finally\s*\{\s*replayQueueInFlight = false;/.test(drain));
pass('drain-start notification failure is handled', /Unable to notify queue drain start/.test(drain));
pass('drain-completion notification failure is handled', /Unable to notify queue drain completion/.test(drain));
pass('unexpected drain failures are surfaced without wedging future retries', /QUEUE_DRAIN_FAILED/.test(drain) && /Queue drain failed/.test(drain));
pass('failed operations are not silently pruned', !/function pruneFailedEntries\s*\(/.test(sw) && /silently deleting a user's failed\/pending operation/.test(sw));
pass('queue capacity still rejects new work rather than evicting old work', /QUEUE_LIMIT_EXCEEDED/.test(sw) && /MAX_QUEUE_ENTRIES\s*=\s*500/.test(sw) && /MAX_QUEUE_TOTAL_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/.test(sw));
const swVersion = sw.match(/const CACHE_VERSION = '(v\d+)'/);
const tsVersion = cacheVersion.match(/SW_CACHE_VERSION = '(v\d+)'/);
pass('service-worker and TypeScript cache versions match', Boolean(swVersion && tsVersion && swVersion[1] === tsVersion[1] && swVersion[1] === 'v61'));
pass('failed request list remains bounded in the UI', /\.slice\(0, 20\)/.test(queueLib) && /retains failed entries until explicit user action/.test(queueLib));
pass('queued mutations receive a stable operation identity', /createOfflineOperationId\(\)/.test(sw) && /headers\['x-offline-op-id'\] = operationId/.test(sw));
pass('replay restores the persisted idempotency header', /sendHeaders\['x-offline-op-id'\] = entry\.operationId/.test(sw));
pass('page fallback persists the same idempotency header', /safeHeaders\['x-offline-op-id'\] = operationId/.test(queueLib));

const failed = checks.filter((c) => !c.passed);
console.log(`[offline-queue-resilience] ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
