import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const MAX_CONCURRENCY = 50;
const MAX_REQUESTS_PER_LEVEL = 100;
const MAX_WARMUP_REQUESTS = 3;
const MAX_SUSTAINED_DURATION_SECONDS = 300;
const MAX_SUSTAINED_RPS = 10;
const MAX_SUSTAINED_IN_FLIGHT = 10;
const REQUEST_TIMEOUT_MS = 15_000;

function parseBoundedInteger(value, fallback, name, min, max) {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseConcurrencyLevels(value = '1,5,10,25,50') {
  const levels = value.split(',').map((part) => {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error('PHASE3_CONCURRENCY_LEVELS must be comma-separated integers.');
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CONCURRENCY) {
      throw new Error(`Concurrency levels must be between 1 and ${MAX_CONCURRENCY}.`);
    }
    return parsed;
  });

  if (levels.length === 0 || new Set(levels).size !== levels.length) {
    throw new Error('PHASE3_CONCURRENCY_LEVELS must contain unique levels.');
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] <= levels[index - 1]) {
      throw new Error('PHASE3_CONCURRENCY_LEVELS must be strictly increasing.');
    }
  }
  return levels;
}

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  if (!(fraction >= 0 && fraction <= 1)) {
    throw new Error('Percentile fraction must be between 0 and 1.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index];
}

export function summarize(values) {
  if (values.length === 0) {
    return { count: 0, min: null, mean: null, p50: null, p95: null, p99: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: round(sorted[0]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    max: round(sorted.at(-1)),
  };
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function finiteDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? round(value)
    : null;
}

function parseBoolean(value, fallback, name) {
  if (value === undefined || value.trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

export function parseConfiguration(env = process.env) {
  const endpoint = env.HYPERDRIVE_PROBE_URL?.trim();
  const token = env.HYPERDRIVE_PROBE_TOKEN;
  if (!endpoint) throw new Error('Set HYPERDRIVE_PROBE_URL to the full /__internal/db-probe URL.');
  if (!token || token.length < 32 || token.length > 512 || /\s/.test(token)) {
    throw new Error('Set HYPERDRIVE_PROBE_TOKEN to the Worker secret (32–512 non-whitespace characters).');
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('HYPERDRIVE_PROBE_URL is not a valid URL.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The probe URL must not contain credentials, query parameters, or a fragment.');
  }
  if (url.pathname !== '/__internal/db-probe') {
    throw new Error('The probe URL path must be exactly /__internal/db-probe.');
  }

  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  const workersDevHost = url.hostname.endsWith('.workers.dev');
  const allowCustomHost = env.ALLOW_CUSTOM_PROBE_HOST === 'true';
  if (!localHost && !workersDevHost && !allowCustomHost) {
    throw new Error('Only *.workers.dev or localhost targets are allowed by default. Set ALLOW_CUSTOM_PROBE_HOST=true for a reviewed HTTPS custom host.');
  }
  if (url.protocol !== 'https:' && !(localHost && url.protocol === 'http:')) {
    throw new Error('HTTPS is required except for localhost development.');
  }

  const sustainedEnabled = parseBoolean(env.PHASE3_ENABLE_SUSTAINED, true, 'PHASE3_ENABLE_SUSTAINED');
  return {
    url,
    token,
    concurrencyLevels: parseConcurrencyLevels(env.PHASE3_CONCURRENCY_LEVELS ?? '1,5,10,25,50'),
    requestsPerLevel: parseBoundedInteger(
      env.PHASE3_REQUESTS_PER_LEVEL,
      60,
      'PHASE3_REQUESTS_PER_LEVEL',
      10,
      MAX_REQUESTS_PER_LEVEL,
    ),
    warmupRequests: parseBoundedInteger(
      env.PHASE3_WARMUP_REQUESTS,
      2,
      'PHASE3_WARMUP_REQUESTS',
      0,
      MAX_WARMUP_REQUESTS,
    ),
    sustainedEnabled,
    sustainedDurationSeconds: parseBoundedInteger(
      env.PHASE3_SUSTAINED_DURATION_SECONDS,
      300,
      'PHASE3_SUSTAINED_DURATION_SECONDS',
      30,
      MAX_SUSTAINED_DURATION_SECONDS,
    ),
    sustainedRps: parseBoundedInteger(
      env.PHASE3_SUSTAINED_RPS,
      10,
      'PHASE3_SUSTAINED_RPS',
      1,
      MAX_SUSTAINED_RPS,
    ),
    sustainedMaxInFlight: parseBoundedInteger(
      env.PHASE3_SUSTAINED_MAX_IN_FLIGHT,
      10,
      'PHASE3_SUSTAINED_MAX_IN_FLIGHT',
      1,
      MAX_SUSTAINED_IN_FLIGHT,
    ),
  };
}

async function performProbe(config) {
  const startedAt = performance.now();
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const clientLatencyMs = round(performance.now() - startedAt);
    const success = response.status === 200 && body?.ok === true;
    return {
      ok: success,
      status: response.status,
      error: success ? null : (typeof body?.error === 'string' ? body.error : 'INVALID_RESPONSE'),
      clientLatencyMs,
      connectDurationMs: finiteDuration(body?.connectDurationMs),
      queryDurationMs: finiteDuration(body?.queryDurationMs),
      workerTotalDurationMs: finiteDuration(body?.totalDurationMs),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.name === 'TimeoutError' ? 'CLIENT_TIMEOUT' : 'REQUEST_FAILED',
      clientLatencyMs: round(performance.now() - startedAt),
      connectDurationMs: null,
      queryDurationMs: null,
      workerTotalDurationMs: null,
    };
  }
}

function summarizeResults(label, concurrency, results, durationMs, maxObservedInFlight) {
  const successes = results.filter((item) => item.ok);
  const failures = results.length - successes.length;
  const errors = {};
  for (const result of results) {
    if (!result.ok) {
      const key = `${result.status || 'NETWORK'}:${result.error}`;
      errors[key] = (errors[key] ?? 0) + 1;
    }
  }

  return {
    label,
    concurrency,
    attempts: results.length,
    successes: successes.length,
    failures,
    failureRatePercent: round((failures / Math.max(1, results.length)) * 100),
    durationMs: round(durationMs),
    requestsPerSecond: round(results.length / Math.max(durationMs / 1000, 0.001)),
    maxObservedInFlight,
    clientLatencyMs: summarize(successes.map((item) => item.clientLatencyMs)),
    workerConnectDurationMs: summarize(successes.map((item) => item.connectDurationMs).filter(Number.isFinite)),
    workerQueryDurationMs: summarize(successes.map((item) => item.queryDurationMs).filter(Number.isFinite)),
    workerTotalDurationMs: summarize(successes.map((item) => item.workerTotalDurationMs).filter(Number.isFinite)),
    errors,
  };
}

async function runRampStage(config, concurrency) {
  const results = [];
  let nextIndex = 0;
  let active = 0;
  let maxObservedInFlight = 0;
  const startedAt = performance.now();

  async function workerLoop() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= config.requestsPerLevel) return;
      active += 1;
      maxObservedInFlight = Math.max(maxObservedInFlight, active);
      try {
        results.push(await performProbe(config));
      } finally {
        active -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));
  return summarizeResults(`ramp-${concurrency}`, concurrency, results, performance.now() - startedAt, maxObservedInFlight);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function failureThreshold(attempts) {
  return Math.max(3, Math.ceil(attempts * 0.05));
}

export async function runSustainedStage(config, probe = performProbe) {
  const durationMs = config.sustainedDurationSeconds * 1000;
  const intervalMs = 1000 / config.sustainedRps;
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  let nextStartAt = startedAt;
  let active = 0;
  let maxObservedInFlight = 0;
  let stopReason = null;
  const results = [];
  const pending = new Set();

  while (performance.now() < deadline && !stopReason) {
    const now = performance.now();
    if (active >= config.sustainedMaxInFlight) {
      await delay(Math.min(20, Math.max(1, nextStartAt - now)));
      continue;
    }
    if (now < nextStartAt) {
      await delay(Math.min(20, nextStartAt - now));
      continue;
    }

    active += 1;
    maxObservedInFlight = Math.max(maxObservedInFlight, active);
    const requestStartedAt = performance.now();
    const task = Promise.resolve()
      .then(() => probe(config))
      .catch(() => ({
        ok: false,
        status: 0,
        error: 'REQUEST_FAILED',
        clientLatencyMs: null,
        connectDurationMs: null,
        queryDurationMs: null,
        workerTotalDurationMs: null,
      }))
      .then((result) => {
        results.push({ ...result, startedAtMs: requestStartedAt - startedAt });
        const failures = results.filter((item) => !item.ok).length;
        if (failures >= failureThreshold(results.length)) {
          stopReason = `Sustained phase reached ${failures} failures in ${results.length} completed requests; new requests were stopped.`;
        }
      })
      .finally(() => {
        active -= 1;
        pending.delete(task);
      });
    pending.add(task);
    nextStartAt = requestStartedAt + intervalMs;
  }

  const loadStoppedAt = performance.now();
  const measurementWindowMs = Math.max(1, Math.min(durationMs, loadStoppedAt - startedAt));
  await Promise.all(pending);
  const actualDurationMs = performance.now() - startedAt;
  const summary = summarizeResults(
    'sustained-rate-limited',
    config.sustainedMaxInFlight,
    results,
    measurementWindowMs,
    maxObservedInFlight,
  );

  const minuteCount = Math.ceil(measurementWindowMs / 60_000);
  const minuteBuckets = Array.from({ length: minuteCount }, (_, minute) => {
    const bucketStartMs = minute * 60_000;
    const bucketDurationMs = Math.min(60_000, measurementWindowMs - bucketStartMs);
    const bucketResults = results.filter((item) => item.startedAtMs >= bucketStartMs && item.startedAtMs < bucketStartMs + bucketDurationMs);
    const failures = bucketResults.filter((item) => !item.ok).length;
    return {
      minute: minute + 1,
      attempts: bucketResults.length,
      successes: bucketResults.length - failures,
      failures,
      requestsPerSecond: round(bucketResults.length / Math.max(bucketDurationMs / 1000, 0.001)),
    };
  });

  return {
    ...summary,
    targetRequestsPerSecond: config.sustainedRps,
    measurementWindowMs: round(measurementWindowMs),
    configuredDurationMs: durationMs,
    actualDurationIncludingDrainMs: round(actualDurationMs),
    minuteBuckets,
    stoppedEarly: Boolean(stopReason),
    stopReason,
  };
}

function printSummary(report) {
  console.log('\nHyperdrive Phase 3 load test');
  console.log(`Target: ${report.target}`);
  console.log(`Warm-up requests: ${report.warmup.requests} (${report.warmup.successes} successful)`);
  console.log(`Ramp requests per level: ${report.configuration.requestsPerLevel}`);
  console.table(report.rampStages.map((stage) => ({
    concurrency: stage.concurrency,
    attempts: stage.attempts,
    failures: stage.failures,
    'HTTP p50 ms': stage.clientLatencyMs.p50,
    'HTTP p95 ms': stage.clientLatencyMs.p95,
    'connect p50 ms': stage.workerConnectDurationMs.p50,
    'query p50 ms': stage.workerQueryDurationMs.p50,
    'max in-flight': stage.maxObservedInFlight,
    'req/s': stage.requestsPerSecond,
  })));

  if (report.sustained) {
    console.log('\nSustained phase');
    console.table([{
      'target req/s': report.sustained.targetRequestsPerSecond,
      attempts: report.sustained.attempts,
      failures: report.sustained.failures,
      'HTTP p50 ms': report.sustained.clientLatencyMs.p50,
      'HTTP p95 ms': report.sustained.clientLatencyMs.p95,
      'max in-flight': report.sustained.maxObservedInFlight,
      'actual req/s': report.sustained.requestsPerSecond,
    }]);
  }
  if (report.stoppedEarly) console.warn(`Stopped early: ${report.stopReason}`);
  if (report.sustained?.stoppedEarly) console.warn(`Sustained phase stopped: ${report.sustained.stopReason}`);
  console.log(`JSON report: ${report.reportPath}`);
}

export async function runBenchmark(config) {
  console.warn('Safety profile: read-only SELECT 1 probe; no retries; max ramp concurrency 50; sustained cap 10 requests/second for at most 5 minutes.');
  const warmupResults = [];
  for (let index = 0; index < config.warmupRequests; index += 1) {
    warmupResults.push(await performProbe(config));
  }

  const warmupFailures = warmupResults.filter((item) => !item.ok).length;
  if (warmupFailures > 0) {
    throw new Error(`Warm-up failed (${warmupFailures}/${warmupResults.length}); benchmark stages were not started. Check URL, token, and Worker health.`);
  }

  const rampStages = [];
  let stoppedEarly = false;
  let stopReason = null;
  for (const concurrency of config.concurrencyLevels) {
    const stage = await runRampStage(config, concurrency);
    rampStages.push(stage);
    if (stage.failures >= failureThreshold(stage.attempts)) {
      stoppedEarly = true;
      stopReason = `Concurrency ${concurrency} produced ${stage.failures}/${stage.attempts} failed requests; higher levels and sustained load were skipped.`;
      break;
    }
  }

  let sustained = null;
  if (!stoppedEarly && config.sustainedEnabled) {
    sustained = await runSustainedStage(config);
  }

  const report = {
    schemaVersion: 1,
    phase: 3,
    generatedAt: new Date().toISOString(),
    target: `${config.url.origin}${config.url.pathname}`,
    readOnly: true,
    safetyLimits: {
      maxRampConcurrency: MAX_CONCURRENCY,
      maxRequestsPerRampLevel: MAX_REQUESTS_PER_LEVEL,
      maxSustainedDurationSeconds: MAX_SUSTAINED_DURATION_SECONDS,
      maxSustainedRequestsPerSecond: MAX_SUSTAINED_RPS,
      maxSustainedInFlight: MAX_SUSTAINED_IN_FLIGHT,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      retries: 0,
    },
    configuration: {
      concurrencyLevels: config.concurrencyLevels,
      requestsPerLevel: config.requestsPerLevel,
      warmupRequests: config.warmupRequests,
      sustainedEnabled: config.sustainedEnabled,
      sustainedDurationSeconds: config.sustainedDurationSeconds,
      sustainedRps: config.sustainedRps,
      sustainedMaxInFlight: config.sustainedMaxInFlight,
    },
    warmup: {
      requests: warmupResults.length,
      successes: warmupResults.length - warmupFailures,
      failures: warmupFailures,
    },
    rampStages,
    sustained,
    stoppedEarly,
    stopReason,
  };

  const reportDirectory = resolve(TOOL_DIR, 'reports');
  await mkdir(reportDirectory, { recursive: true });
  const timestamp = report.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const reportPath = resolve(reportDirectory, `phase3-${timestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  report.reportPath = reportPath;
  printSummary(report);
  return report;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMainModule) {
  try {
    const config = parseConfiguration();
    await runBenchmark(config);
  } catch (error) {
    console.error(`Phase 3 benchmark not completed: ${error instanceof Error ? error.message : 'unexpected error'}`);
    process.exitCode = 1;
  }
}
