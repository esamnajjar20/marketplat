import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const MAX_CONCURRENCY = 5;
const MAX_REQUESTS_PER_LEVEL = 60;
const MAX_WARMUP_REQUESTS = 2;
const MAX_SUSTAINED_DURATION_SECONDS = 120;
const MAX_SUSTAINED_RPS = 5;
const MAX_SUSTAINED_IN_FLIGHT = 2;
const REQUEST_TIMEOUT_MS = 12_000;

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function parseBoundedInteger(value, fallback, name, min, max) {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  if (!(fraction >= 0 && fraction <= 1)) throw new Error('Percentile fraction must be between 0 and 1.');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, min: null, mean: null, p50: null, p95: null, p99: null, max: null };
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

export function parseConcurrencyLevels(value = '1,2') {
  const levels = value.split(',').map((part) => {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error('PHASE5_CONCURRENCY_LEVELS must be comma-separated integers.');
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CONCURRENCY) {
      throw new Error(`Concurrency levels must be between 1 and ${MAX_CONCURRENCY} in the safe default profile.`);
    }
    return parsed;
  });
  if (!levels.length || new Set(levels).size !== levels.length) throw new Error('PHASE5_CONCURRENCY_LEVELS must contain unique levels.');
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] <= levels[index - 1]) throw new Error('PHASE5_CONCURRENCY_LEVELS must be strictly increasing.');
  }
  return levels;
}

function parseProbeUrl(raw, name, path, allowCustomHost) {
  if (!raw?.trim()) throw new Error(`Set ${name} to the full probe URL.`);
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error(`${name} is not a valid URL.`); }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${name} must not contain credentials, query parameters, or a fragment.`);
  if (url.pathname !== path) throw new Error(`${name} path must be exactly ${path}.`);
  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  const workersDevHost = url.hostname.endsWith('.workers.dev');
  if (!localHost && !workersDevHost && !allowCustomHost) throw new Error(`${name} must target *.workers.dev or localhost unless PHASE5_ALLOW_CUSTOM_HOST=true.`);
  if (url.protocol !== 'https:' && !(localHost && url.protocol === 'http:')) throw new Error(`${name} requires HTTPS except for localhost.`);
  return url;
}

export function parseConfiguration(env = process.env) {
  const token = env.HYPERDRIVE_PROBE_TOKEN;
  if (!token || token.length < 32 || token.length > 512 || /\s/.test(token)) {
    throw new Error('Set HYPERDRIVE_PROBE_TOKEN to the Worker secret (32–512 non-whitespace characters).');
  }
  const allowCustomHost = env.PHASE5_ALLOW_CUSTOM_HOST === 'true';
  const directUrl = parseProbeUrl(env.PHASE5_DIRECT_PROBE_URL, 'PHASE5_DIRECT_PROBE_URL', '/__internal/direct-db-probe', allowCustomHost);
  const hyperdriveUrl = parseProbeUrl(env.PHASE5_HYPERDRIVE_PROBE_URL, 'PHASE5_HYPERDRIVE_PROBE_URL', '/__internal/db-probe', allowCustomHost);
  const sustainedValue = env.PHASE5_ENABLE_SUSTAINED;
  if (sustainedValue !== undefined && sustainedValue !== '' && !['true', 'false'].includes(sustainedValue)) {
    throw new Error('PHASE5_ENABLE_SUSTAINED must be true or false.');
  }
  return {
    token,
    targets: {
      direct: { mode: 'direct', url: directUrl },
      hyperdrive: { mode: 'hyperdrive', url: hyperdriveUrl },
    },
    concurrencyLevels: parseConcurrencyLevels(env.PHASE5_CONCURRENCY_LEVELS ?? '1,2'),
    requestsPerLevel: parseBoundedInteger(env.PHASE5_REQUESTS_PER_LEVEL, 20, 'PHASE5_REQUESTS_PER_LEVEL', 10, MAX_REQUESTS_PER_LEVEL),
    warmupRequests: parseBoundedInteger(env.PHASE5_WARMUP_REQUESTS, 1, 'PHASE5_WARMUP_REQUESTS', 0, MAX_WARMUP_REQUESTS),
    sustainedEnabled: sustainedValue !== 'false',
    sustainedDurationSeconds: parseBoundedInteger(env.PHASE5_SUSTAINED_DURATION_SECONDS, 30, 'PHASE5_SUSTAINED_DURATION_SECONDS', 15, MAX_SUSTAINED_DURATION_SECONDS),
    sustainedRps: parseBoundedInteger(env.PHASE5_SUSTAINED_RPS, 2, 'PHASE5_SUSTAINED_RPS', 1, MAX_SUSTAINED_RPS),
    sustainedMaxInFlight: parseBoundedInteger(env.PHASE5_SUSTAINED_MAX_IN_FLIGHT, 1, 'PHASE5_SUSTAINED_MAX_IN_FLIGHT', 1, MAX_SUSTAINED_IN_FLIGHT),
  };
}

async function performProbe(target, token) {
  const startedAt = performance.now();
  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body = null;
    try { body = await response.json(); } catch { /* Sanitized as invalid response below. */ }
    const clientLatencyMs = round(performance.now() - startedAt);
    const ok = response.status === 200 && body?.ok === true && body?.connectionMode === target.mode;
    return {
      ok,
      status: response.status,
      error: ok ? null : (typeof body?.error === 'string' ? body.error : 'INVALID_RESPONSE'),
      clientLatencyMs,
      connectDurationMs: Number.isFinite(body?.connectDurationMs) ? body.connectDurationMs : null,
      queryDurationMs: Number.isFinite(body?.queryDurationMs) ? body.queryDurationMs : null,
      workerTotalDurationMs: Number.isFinite(body?.totalDurationMs) ? body.totalDurationMs : null,
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

function failureThreshold(attempts) { return Math.max(2, Math.ceil(attempts * 0.05)); }

function summarizeStage(label, concurrency, results, durationMs, maxInFlight) {
  const successes = results.filter((item) => item.ok);
  const errors = {};
  for (const item of results) if (!item.ok) {
    const key = `${item.status || 'NETWORK'}:${item.error}`;
    errors[key] = (errors[key] ?? 0) + 1;
  }
  return {
    label,
    concurrency,
    attempts: results.length,
    successes: successes.length,
    failures: results.length - successes.length,
    failureRatePercent: round(((results.length - successes.length) / Math.max(1, results.length)) * 100),
    durationMs: round(durationMs),
    requestsPerSecond: round(results.length / Math.max(durationMs / 1000, 0.001)),
    maxObservedInFlight: maxInFlight,
    clientLatencyMs: summarize(successes.map((item) => item.clientLatencyMs)),
    workerConnectDurationMs: summarize(successes.map((item) => item.connectDurationMs)),
    workerQueryDurationMs: summarize(successes.map((item) => item.queryDurationMs)),
    workerTotalDurationMs: summarize(successes.map((item) => item.workerTotalDurationMs)),
    errors,
  };
}

async function runRampStage(target, config, concurrency) {
  const results = [];
  let nextIndex = 0;
  let active = 0;
  let maxInFlight = 0;
  const startedAt = performance.now();
  async function loop() {
    while (true) {
      const index = nextIndex++;
      if (index >= config.requestsPerLevel) return;
      active += 1;
      maxInFlight = Math.max(maxInFlight, active);
      try { results.push(await performProbe(target, config.token)); }
      finally { active -= 1; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => loop()));
  return summarizeStage(`ramp-${concurrency}`, concurrency, results, performance.now() - startedAt, maxInFlight);
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function runSustainedStage(target, config) {
  const durationMs = config.sustainedDurationSeconds * 1000;
  const intervalMs = 1000 / config.sustainedRps;
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  let nextStartAt = startedAt;
  let active = 0;
  let maxInFlight = 0;
  let stopReason = null;
  const results = [];
  const pending = new Set();

  while (performance.now() < deadline && !stopReason) {
    const now = performance.now();
    if (active >= config.sustainedMaxInFlight || now < nextStartAt) {
      await delay(Math.min(20, Math.max(1, nextStartAt - now)));
      continue;
    }
    active += 1;
    maxInFlight = Math.max(maxInFlight, active);
    const requestStart = performance.now();
    const task = performProbe(target, config.token)
      .then((result) => {
        results.push({ ...result, startedAtMs: requestStart - startedAt });
        const failures = results.filter((item) => !item.ok).length;
        if (failures >= failureThreshold(results.length)) stopReason = 'Failure threshold reached; no additional requests were started.';
      })
      .finally(() => { active -= 1; pending.delete(task); });
    pending.add(task);
    nextStartAt = requestStart + intervalMs;
  }
  const loadStoppedAt = performance.now();
  await Promise.all(pending);
  const measurementWindowMs = Math.max(1, loadStoppedAt - startedAt);
  const summary = summarizeStage('sustained-rate-limited', config.sustainedMaxInFlight, results, measurementWindowMs, maxInFlight);
  return {
    ...summary,
    targetRequestsPerSecond: config.sustainedRps,
    configuredDurationMs: durationMs,
    actualDurationIncludingDrainMs: round(performance.now() - startedAt),
    stoppedEarly: Boolean(stopReason),
    stopReason,
  };
}

export async function runComparison(config) {
  console.warn('Safety profile: read-only SELECT 1; default ramp 1,2; 20 requests/level; sustained 2 RPS for 30 seconds; max 1 sustained in-flight; no retries.');
  const warmup = {};
  for (const mode of ['direct', 'hyperdrive']) {
    const target = config.targets[mode];
    const results = [];
    for (let index = 0; index < config.warmupRequests; index += 1) results.push(await performProbe(target, config.token));
    const failures = results.filter((item) => !item.ok).length;
    warmup[mode] = { requests: results.length, successes: results.length - failures, failures };
    if (failures > 0) throw new Error(`${mode} warm-up failed (${failures}/${results.length}); no benchmark stages were started.`);
  }

  const rampStages = { direct: [], hyperdrive: [] };
  let stoppedEarly = false;
  let stopReason = null;
  for (const [index, concurrency] of config.concurrencyLevels.entries()) {
    // Alternate which path runs first at each level to reduce systematic order bias.
    const order = index % 2 === 0 ? ['direct', 'hyperdrive'] : ['hyperdrive', 'direct'];
    for (const mode of order) {
      const stage = await runRampStage(config.targets[mode], config, concurrency);
      rampStages[mode].push(stage);
      if (stage.failures >= failureThreshold(stage.attempts)) {
        stoppedEarly = true;
        stopReason = `${mode} failed at concurrency ${concurrency}; remaining benchmark levels were skipped for safety.`;
        break;
      }
    }
    if (stoppedEarly) break;
  }

  const sustained = { direct: null, hyperdrive: null };
  if (!stoppedEarly && config.sustainedEnabled) {
    sustained.direct = await runSustainedStage(config.targets.direct, config);
    if (!sustained.direct.stoppedEarly) sustained.hyperdrive = await runSustainedStage(config.targets.hyperdrive, config);
  }

  const report = {
    schemaVersion: 1,
    phase: 5,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    query: 'SELECT 1::int AS ok',
    targets: Object.fromEntries(Object.entries(config.targets).map(([mode, target]) => [mode, `${target.url.origin}${target.url.pathname}`])),
    safetyLimits: {
      maxConcurrency: MAX_CONCURRENCY,
      maxRequestsPerLevel: MAX_REQUESTS_PER_LEVEL,
      maxSustainedDurationSeconds: MAX_SUSTAINED_DURATION_SECONDS,
      maxSustainedRps: MAX_SUSTAINED_RPS,
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
    warmup,
    rampStages,
    sustained,
    stoppedEarly,
    stopReason,
    interpretationLimitations: [
      'This measures a Cloudflare Worker probe, not the complete Express/Prisma or Go application.',
      'SELECT 1 does not represent production query mix, transaction behavior, locks, or write throughput.',
      'Correlate the report with PostgreSQL connection snapshots and Cloudflare/Aiven resource metrics.',
    ],
  };
  const reportDirectory = resolve(TOOL_DIR, 'reports');
  await mkdir(reportDirectory, { recursive: true });
  const timestamp = report.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const reportPath = resolve(reportDirectory, `phase5-connection-comparison-${timestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  report.reportPath = reportPath;
  console.log('\nDirect vs Hyperdrive comparison');
  for (const mode of ['direct', 'hyperdrive']) {
    console.log(`\n${mode}`);
    console.table(rampStages[mode].map((stage) => ({
      concurrency: stage.concurrency,
      attempts: stage.attempts,
      failures: stage.failures,
      'HTTP p50 ms': stage.clientLatencyMs.p50,
      'HTTP p95 ms': stage.clientLatencyMs.p95,
      'HTTP p99 ms': stage.clientLatencyMs.p99,
      'connect p50 ms': stage.workerConnectDurationMs.p50,
      'query p50 ms': stage.workerQueryDurationMs.p50,
      'max in-flight': stage.maxObservedInFlight,
      'req/s': stage.requestsPerSecond,
    })));
    if (sustained[mode]) console.log('Sustained:', sustained[mode]);
  }
  if (stoppedEarly) console.warn(`Comparison stopped early: ${stopReason}`);
  console.log(`JSON report: ${reportPath}`);
  return report;
}

const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMainModule) {
  try { await runComparison(parseConfiguration()); }
  catch (error) {
    console.error(`Phase 5 comparison not completed: ${error instanceof Error ? error.message : 'unexpected error'}`);
    process.exitCode = 1;
  }
}
