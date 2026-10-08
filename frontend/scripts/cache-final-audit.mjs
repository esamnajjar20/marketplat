#!/usr/bin/env node
/** CACHE-W12 — final cache architecture gate. */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.cwd(), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const pass = (m) => console.log(`[cache-final] PASS: ${m}`);
const fail = (m) => failures.push(m);

for (const p of [
  'shared/cache/cache-contract.json',
  'shared/cache/cacheKey.ts',
  'frontend/lib/cache/cache-contract.json',
  'frontend/lib/cache/cacheKey.ts',
  'backend/src/shared/cache/cache-contract.json',
  'backend/src/shared/cache/cacheKey.ts',
  'frontend/public/cache-contract.js',
  'frontend/public/sw.js',
  'frontend/lib/offlineStoragePressure.ts',
  'frontend/lib/cache/queryCacheInvalidation.ts',
  'backend/src/shared/utils/swrCache.ts',
  'backend/src/shared/utils/cacheMetrics.ts',
  'frontend/scripts/cache-contract-audit.mjs',
  'frontend/scripts/cache-performance-audit.mjs',
]) if (!exists(p)) fail(`required file missing: ${p}`);

if (failures.length) { failures.forEach((m) => console.error(`[cache-final] FAIL: ${m}`)); process.exit(1); }

const contract = JSON.parse(read('shared/cache/cache-contract.json'));
const domains = Object.keys(contract.domains);
if (domains.length !== 23) fail(`expected 23 canonical domains, got ${domains.length}`); else pass('23 canonical cache domains present');
if (contract.keyAlgorithmVersion !== 1) fail('unexpected cache key algorithm version');

const fk = read('frontend/lib/cache/cacheKey.ts');
const bk = read('backend/src/shared/cache/cacheKey.ts');
const sk = read('shared/cache/cacheKey.ts');
if (fk !== sk || bk !== sk) fail('cache-key implementations diverge'); else pass('frontend/backend/shared cache-key implementations match');

const sw = read('frontend/public/sw.js');
if (!sw.includes("type === 'TRIM_DISPOSABLE_CACHES'")) fail('W11 coordinated disposable-cache trim missing');
if (!sw.includes('trimCache(API_CACHE') || !sw.includes('trimCache(IMAGE_CACHE')) fail('W11 trim command does not trim API/image caches');
if (sw.includes("caches.delete(API_CACHE)") && !sw.includes("type === 'CLEAR_API_CACHE'")) fail('unexpected broad API cache deletion');
else pass('W11 lifecycle cleanup is coordinated and tier-aware');

const pressure = read('frontend/lib/offlineStoragePressure.ts');
if (!pressure.includes("postMessage({ type: 'TRIM_DISPOSABLE_CACHES' })")) fail('browser pressure guard bypasses SW lifecycle coordinator');
else pass('storage pressure delegates disposable cleanup to SW');

const metrics = read('backend/src/shared/utils/cacheMetrics.ts');
const swr = read('backend/src/shared/utils/swrCache.ts');
if (!metrics.includes('app_cache_operation_duration_seconds') || !swr.includes('cacheMetrics.observeDuration')) fail('W10 cache latency instrumentation incomplete');
else pass('W10 cache latency telemetry is wired to SWR outcomes');

const warmupMetrics = read('backend/src/shared/utils/metrics.ts');
const warmup = read('backend/src/shared/utils/cacheWarmup.ts');
if (!warmupMetrics.includes('cache_warmup_tasks_total') || !warmupMetrics.includes('cache_warmup_task_duration_seconds')) fail('cache warmup telemetry definitions missing');
else if (!warmup.includes('cacheWarmupTasksTotal.inc') || !warmup.includes('cacheWarmupTaskDurationSeconds.observe')) fail('cache warmup telemetry is not wired to task outcomes');
else pass('cache warmup telemetry is defined and wired');

const pressureSource = read('frontend/lib/offlineStoragePressure.ts');
if (pressureSource.includes('SW_CACHE_VERSION')) fail('storage pressure module carries an unused cache-version dependency');
else pass('storage pressure module has no dead cache-version dependency');

const contractAudit = read('frontend/scripts/cache-contract-audit.mjs');
if (!contractAudit.includes('queryPrefixes')) fail('W8 contract audit incomplete'); else pass('W8 contract audit remains installed');
const perfAudit = read('frontend/scripts/cache-performance-audit.mjs');
if (!perfAudit.includes('app_cache_operation_duration_seconds')) fail('W10 performance audit incomplete'); else pass('W10 performance audit installed');

if (failures.length) { failures.forEach((m) => console.error(`[cache-final] FAIL: ${m}`)); process.exit(1); }
console.log('[cache-final] CACHE W1-W12 AUDIT PASSED');
