import fs from 'node:fs';

const sw = fs.readFileSync('public/sw.js', 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

check('mutation captures queue lifecycle before network await', /async function handleMutation\(request\)[\s\S]*?const enqueueLifecycleVersion = queueLifecycleVersion;/.test(sw));
check('enqueue checks lifecycle after asynchronous IndexedDB open', /async function queueRequestEntry\(entry, lifecycleVersion = queueLifecycleVersion\)[\s\S]*?const db = await openQueueDb\(\);[\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\)/.test(sw));
check('enqueue refuses to write when lifecycle has changed', /Queue lifecycle changed before enqueue/.test(sw));
check('queued entry write receives the original request lifecycle', /await queueRequestEntry\(entry, enqueueLifecycleVersion\)/.test(sw));
check('stale requests return explicit session-changed response', /code: 'QUEUE_SESSION_CHANGED'[\s\S]*?status: 409/.test(sw));
check('enqueue failure distinguishes lifecycle change from storage failure', /const lifecycleChanged =[\s\S]*?storeErr\?\.code === 'QUEUE_LIFECYCLE_CHANGED'[\s\S]*?QUEUE_STORE_FAILED/.test(sw));
check('ownerless unsafe operations are not replayed as the active user', /if \(isUnsafeMethod\(entry\.method\) && currentOwner && !queuedOwner\)[\s\S]*?needsRecovery: true[\s\S]*?return 'failed';/.test(sw));
check('existing owner mismatch fence remains active', /if \(queuedOwner && currentOwner && queuedOwner !== currentOwner\)[\s\S]*?status: 403/.test(sw));
check('clear increments lifecycle before queue deletion', /queueLifecycleVersion \+= 1;\s*queueClearInFlight = true;[\s\S]*?const all = await getAllQueuedEntries\(\)/.test(sw));
check('replay lifecycle fence remains active', /async function replayQueueImpl\(lifecycleVersion = queueLifecycleVersion\)[\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return metrics/.test(sw));

for (const result of checks) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
console.log(`\n${checks.filter((x) => x.passed).length}/${checks.length} checks passed`);
if (checks.some((x) => !x.passed)) process.exitCode = 1;
