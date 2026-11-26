import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const MAX_CONCURRENCY = 5;
const MAX_REQUESTS_PER_LEVEL = 50;
const MAX_WARMUP_REQUESTS = 3;
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

export function parseConcurrencyLevels(value = '1,2,5') {
  const levels = value.split(',').map((part) => {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error('BENCHMARK_CONCURRENCY_LEVELS must be comma-separated integers.');
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CONCURRENCY) {
      throw new Error(`Concurrency levels must be between 1 and ${MAX_CONCURRENCY}.`);
    }
    return parsed;
  });

  if (levels.length === 0 || new Set(levels).size !== levels.length) {
    throw new Error('BENCHMARK_CONCURRENCY_LEVELS must contain unique levels.');
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

  const requestsPerLevel = parseBoundedInteger(
    env.BENCHMARK_REQUESTS_PER_LEVEL,
    20,
    'BENCHMARK_REQUESTS_PER_LEVEL',
    5,
    MAX_REQUESTS_PER_LEVEL,
  );
  const warmupRequests = parseBoundedInteger(
    env.BENCHMARK_WARMUP_REQUESTS,
    2,
    'BENCHMARK_WARMUP_REQUESTS',
    0,
    MAX_WARMUP_REQUESTS,
  );

  return {
    url,
    token,
    concurrencyLevels: parseConcurrencyLevels(env.BENCHMARK_CONCURRENCY_LEVELS ?? '1,2,5'),
    requestsPerLevel,
    warmupRequests,
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

function summarizeStage(concurrency, results, durationMs) {
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
    concurrency,
    attempts: results.length,
    successes: successes.length,
    failures,
    failureRatePercent: round((failures / Math.max(1, results.length)) * 100),
    durationMs: round(durationMs),
    requestsPerSecond: round(results.length / Math.max(durationMs / 1000, 0.001)),
    clientLatencyMs: summarize(successes.map((item) => item.clientLatencyMs)),
    workerConnectDurationMs: summarize(successes.map((item) => item.connectDurationMs).filter(Number.isFinite)),
    workerQueryDurationMs: summarize(successes.map((item) => item.queryDurationMs).filter(Number.isFinite)),
    workerTotalDurationMs: summarize(successes.map((item) => item.workerTotalDurationMs).filter(Number.isFinite)),
    errors,
  };
}

async function runStage(config, concurrency) {
  const results = [];
  let nextIndex = 0;
  const startedAt = performance.now();

  async function workerLoop() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= config.requestsPerLevel) return;
      results.push(await performProbe(config));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));
  return summarizeStage(concurrency, results, performance.now() - startedAt);
}

function printSummary(report) {
  console.log('\nHyperdrive Phase 2 benchmark');
  console.log(`Target: ${report.target}`);
  console.log(`Warm-up requests: ${report.warmup.requests} (${report.warmup.successes} successful)`);
  console.log(`Requests per concurrency level: ${report.configuration.requestsPerLevel}`);
  console.table(report.stages.map((stage) => ({
    concurrency: stage.concurrency,
    attempts: stage.attempts,
    failures: stage.failures,
    'HTTP p50 ms': stage.clientLatencyMs.p50,
    'HTTP p95 ms': stage.clientLatencyMs.p95,
    'connect p50 ms': stage.workerConnectDurationMs.p50,
    'query p50 ms': stage.workerQueryDurationMs.p50,
    'Worker total p50 ms': stage.workerTotalDurationMs.p50,
    'req/s': stage.requestsPerSecond,
  })));
  if (report.stoppedEarly) {
    console.warn(`Stopped early: ${report.stopReason}`);
  }
  console.log(`JSON report: ${report.reportPath}`);
}

export async function runBenchmark(config) {
  const warmupResults = [];
  for (let index = 0; index < config.warmupRequests; index += 1) {
    warmupResults.push(await performProbe(config));
  }

  const warmupFailures = warmupResults.filter((item) => !item.ok).length;
  if (warmupFailures > 0) {
    throw new Error(`Warm-up failed (${warmupFailures}/${warmupResults.length}); benchmark stages were not started. Check URL, token, and Worker health.`);
  }

  const stages = [];
  let stoppedEarly = false;
  let stopReason = null;
  for (const concurrency of config.concurrencyLevels) {
    const stage = await runStage(config, concurrency);
    stages.push(stage);
    const failureThreshold = Math.max(2, Math.ceil(stage.attempts * 0.1));
    if (stage.failures >= failureThreshold) {
      stoppedEarly = true;
      stopReason = `Concurrency ${concurrency} produced ${stage.failures}/${stage.attempts} failed requests; higher levels were skipped.`;
      break;
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: `${config.url.origin}${config.url.pathname}`,
    readOnly: true,
    safetyLimits: {
      maxConcurrency: MAX_CONCURRENCY,
      maxRequestsPerLevel: MAX_REQUESTS_PER_LEVEL,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      retries: 0,
    },
    configuration: {
      concurrencyLevels: config.concurrencyLevels,
      requestsPerLevel: config.requestsPerLevel,
      warmupRequests: config.warmupRequests,
    },
    warmup: {
      requests: warmupResults.length,
      successes: warmupResults.length - warmupFailures,
      failures: warmupFailures,
    },
    stages,
    stoppedEarly,
    stopReason,
  };

  const reportDirectory = resolve(TOOL_DIR, 'reports');
  await mkdir(reportDirectory, { recursive: true });
  const timestamp = report.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const reportPath = resolve(reportDirectory, `phase2-${timestamp}.json`);
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
    console.error(`Benchmark not completed: ${error instanceof Error ? error.message : 'unexpected error'}`);
    process.exitCode = 1;
  }
}
