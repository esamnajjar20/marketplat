import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scheduler = readFileSync(resolve('lib/offlineWarmingScheduler.ts'), 'utf8');
const tests = readFileSync(resolve('__tests__/unit/lib/offlineWarmingScheduler.test.ts'), 'utf8');
const checks = [
  ['idle callback is cancellable', scheduler.includes('cancelIdle?.(idleHandle)')],
  ['fallback idle timer is cancellable', scheduler.includes('window.clearTimeout(idleHandle)')],
  ['stale callbacks are generation-fenced', scheduler.includes('generation !== scheduleGeneration')],
  ['generation advances on cancellation', scheduler.includes('scheduleGeneration += 1;')],
  ['visibility is rechecked immediately before start', scheduler.includes("if (document.visibilityState === 'hidden') return;")],
  ['online state is rechecked immediately before start', scheduler.includes('navigator.onLine === false')],
  ['live network policy is rechecked before start', scheduler.includes('!policy.allowBackgroundWarming')],
  ['pending work is only consumed after lifecycle gates', scheduler.indexOf('const job = pending;\n  pending = null;') > scheduler.indexOf('function start(): void {')],
  ['regression test covers visibility changes after idle scheduling', tests.includes('re-checks visibility after the idle callback has been queued')],
  ['regression test covers cancellation of idle callbacks', tests.includes('cancels a queued idle callback when scheduled warming is cancelled')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
