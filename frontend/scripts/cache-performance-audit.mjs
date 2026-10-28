#!/usr/bin/env node
/**
 * CACHE-W10 — static performance/observability gate.
 *
 * This does not fake runtime numbers. It verifies that cache latency is
 * instrumented at the SWR boundary and that the metric remains bounded.
 * Real hit/miss latency must be measured from Prometheus in a deployed env.
 */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.cwd(), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (m) => { console.error(`[cache-perf] FAIL: ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`[cache-perf] PASS: ${m}`);
const metrics = read('backend/src/shared/utils/cacheMetrics.ts');
const swr = read('backend/src/shared/utils/swrCache.ts');
if (!metrics.includes('app_cache_operation_duration_seconds')) fail('cache duration histogram missing');
if (!metrics.includes("labelNames: ['cache', 'event']")) fail('duration labels are not bounded');
if (!metrics.includes('observeDuration')) fail('duration observer missing');
if (!swr.includes('process.hrtime.bigint()')) fail('SWR boundary does not use monotonic timing');
if (!swr.includes('cacheMetrics.observeDuration')) fail('SWR result paths do not record duration');
if (!metrics.includes('0.001') || !metrics.includes('5')) fail('latency buckets do not cover fast and slow cache paths');
if (process.exitCode) process.exit(1);
pass('W10 cache latency instrumentation is complete and bounded');
