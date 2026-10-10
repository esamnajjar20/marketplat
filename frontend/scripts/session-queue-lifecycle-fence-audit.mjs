import fs from 'node:fs';

const sw = fs.readFileSync('public/sw.js', 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

check('queue replay has a monotonic lifecycle fence', /let queueLifecycleVersion = 0;/.test(sw));
check('each drain captures the lifecycle version before asynchronous work', /async function replayQueue\(\)[\s\S]*?const lifecycleVersion = queueLifecycleVersion;[\s\S]*?replayQueueImpl\(lifecycleVersion\)/.test(sw));
check('queue clear increments the fence before aborting requests and deleting rows', /queueLifecycleVersion \+= 1;\s*queueClearInFlight = true;\s*\/\/ Abort mutations currently/.test(sw));
check('drain exits when clear invalidates its snapshot', /async function replayQueueImpl\(lifecycleVersion = queueLifecycleVersion\)[\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return metrics;[\s\S]*?for \(const entry of entries\) \{\s*if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) break;/.test(sw));
check('refresh completion is fenced before using refreshed credentials', /const r = await refreshAccessToken\(entries\[0\]\.url\);\s*if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return metrics;/.test(sw));
check('an individual replay checks the fence before sending', /async function replayOne\([\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return 'still-offline';[\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return 'still-offline';\s*\/\/ Defense-in-depth/.test(sw));
check('response from an aborted/stale request is ignored before cache/queue writes', /A logout\/account switch may have aborted the request[\s\S]*?if \(queueClearInFlight \|\| lifecycleVersion !== queueLifecycleVersion\) return 'still-offline';\s*\n\s*if \(response\.ok\)/.test(sw));
check('401-refresh recursive replay carries the original lifecycle version', /replayOne\(updatedEntry, true, fresh, 'ok', lifecycleVersion\)/.test(sw));

for (const result of checks) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
console.log(`\n${checks.filter((x) => x.passed).length}/${checks.length} checks passed`);
if (checks.some((x) => !x.passed)) process.exitCode = 1;
