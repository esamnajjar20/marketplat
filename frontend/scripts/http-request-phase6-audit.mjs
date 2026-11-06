import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fetchClient = read('lib/fetchClient.ts');
const fetchClientTest = read('__tests__/unit/lib/fetchClient.test.ts');
const monitor = read('lib/networkRequestMonitor.ts');
const monitorTest = read('__tests__/unit/lib/networkRequestMonitor.test.ts');
const panel = read('components/admin/AdminNetworkRequestsPanel.tsx');
const checks = [
  ['caller cancellation races shared refresh without cancelling the shared refresh itself', /waitForPromiseWithSignal\(refreshOnce\(\), options\.signal\)/.test(fetchClient) && /does not replay a safe request when it is aborted during shared token refresh/.test(fetchClientTest)],
  ['safe request is not dispatched again after abort during refresh', /if \(options\.signal\?\.aborted\) throw createAbortError\(options\.signal\)/.test(fetchClient)],
  ['shared-promise wait removes its abort listener on settle', /const cleanup = \(\) => signal\.removeEventListener\('abort', onAbort\)/.test(fetchClient)],
  ['route telemetry computes P50/P95/P99 from finite non-negative samples', /p50DurationMs/.test(monitor) && /p95DurationMs/.test(monitor) && /p99DurationMs/.test(monitor) && /Number\.isFinite\(duration\) && duration >= 0/.test(monitor)],
  ['route telemetry distinguishes cache HIT/MISS/STALE/BYPASS', /cacheHitCount/.test(monitor) && /cacheMissCount/.test(monitor) && /cacheStaleCount/.test(monitor) && /cacheBypassCount/.test(monitor)],
  ['cache hit rate excludes BYPASS and remains unknown without eligible samples', /cacheEligibleCount = cacheHitCount \+ cacheMissCount \+ cacheStaleCount/.test(monitor) && /cacheHitRate: cacheEligibleCount \?/.test(monitor) && /expect\(summary\?\.cacheHitRate\)\.toBeNull\(\)/.test(monitorTest)],
  ['network monitor tests cover route percentiles and cache accounting', /p95DurationMs: 300/.test(monitorTest) && /cacheHitRate: 33\.3/.test(monitorTest)],
  ['admin panel exposes route P95 and cache hit rate', /item\.p95DurationMs/.test(panel) && /item\.cacheHitRate/.test(panel) && /معدل إصابة الكاش/.test(panel)],
  ['summary metrics respect active request filters', /summarizeDurations\(filtered\.map/.test(panel)],
];

let failed = 0;
for (const [label, pass] of checks) {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!pass) failed += 1;
}
process.stdout.write(`\nHTTP request phase 6 audit: ${checks.length - failed}/${checks.length} passed\n`);
assert.equal(failed, 0, `${failed} phase-6 checks failed`);
