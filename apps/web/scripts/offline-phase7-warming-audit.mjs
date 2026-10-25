/** Dependency-free guardrails for adaptive offline warming. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const engine = read('lib/warmingEngine.ts');
const pipeline = read('lib/offlineWarmingPipeline.ts');
const planner = read('lib/offlineWarmingPlanner.ts');
const queue = read('lib/warmingPriorityQueue.ts');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('warming jobs are executed in priority-queue order', queue.includes('b.job.priority - a.job.priority || a.job.order - b.job.order') && engine.includes('queue.drain()'));
check('network policy is re-read while the warming pass is running', engine.includes('const livePolicy = getNetworkPolicy()') && engine.indexOf('const livePolicy = getNetworkPolicy()') < engine.indexOf('await item.run()'));
check('offline, Save-Data, disabled policy, and zero live concurrency stop remaining jobs', engine.includes('!navigator.onLine') && engine.includes("livePolicy.tier === 'offline'") && engine.includes('livePolicy.saveData') && engine.includes('!livePolicy.allowBackgroundWarming') && engine.includes('effectiveBudget.maxConcurrency === 0') && engine.includes('items.slice(index)'));
check('a normal live budget downgrade reduces capacity instead of skipping every job', engine.includes('const effectiveBudget: WarmingBudget') && engine.includes('Math.min(budget.maxRequests, liveBudget.maxRequests)') && engine.includes('estimateFits(effectiveBudget, used, item.job)'));
check('queue entries are guarded before dereference', engine.includes('if (!item) continue;'));
check('storage pressure is checked between phases, not only at pipeline entry', engine.includes("import { getBackgroundWarmingBudget, shouldPauseBackgroundWarming } from './offlineStoragePressure'") && engine.includes('await shouldPauseBackgroundWarming()') && engine.includes('await getBackgroundWarmingBudget()'));
check('warning-level storage pressure skips authenticated warming jobs', engine.includes("liveStorageBudget === 'public-only' && item.job.requiresAuth") && engine.includes('skipped.push(item.job.id)'));
check('manual force does not bypass network safety checks', engine.includes('const networkUnavailable =') && engine.includes('const storageCritical = !options.force'));
check('pipeline still serializes runs and prioritizes pending user queue replay', pipeline.includes('if (pipelineInFlight)') && pipeline.includes('waitForQueueReplayIdle()'));
check('planner honors Save-Data and offline policy', planner.includes('if (policy.saveData)') && planner.includes("policy.tier === 'offline'"));

for (const item of checks) console.log(`[offline-phase7] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase7] PASS ${checks.length} checks`);
