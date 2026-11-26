import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseConcurrencyLevels,
  parseConfiguration,
  percentile,
  runSustainedStage,
  summarize,
} from './phase3-benchmark.mjs';

const validEnvironment = {
  HYPERDRIVE_PROBE_URL: 'https://marketplat-hyperdrive-probe.example.workers.dev/__internal/db-probe',
  HYPERDRIVE_PROBE_TOKEN: 'x'.repeat(64),
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('phase 3 defaults to a strictly increasing bounded concurrency ramp', () => {
  const config = parseConfiguration(validEnvironment);
  assert.deepEqual(config.concurrencyLevels, [1, 5, 10, 25, 50]);
  assert.equal(config.requestsPerLevel, 60);
  assert.equal(config.warmupRequests, 2);
  assert.equal(config.sustainedEnabled, true);
  assert.equal(config.sustainedDurationSeconds, 300);
  assert.equal(config.sustainedRps, 10);
  assert.equal(config.sustainedMaxInFlight, 10);
});

test('phase 3 rejects unsafe, duplicate, or unordered concurrency levels', () => {
  assert.throws(() => parseConcurrencyLevels('1,51'), /between 1 and 50/);
  assert.throws(() => parseConcurrencyLevels('1,5,5'), /unique levels/);
  assert.throws(() => parseConcurrencyLevels('5,1'), /strictly increasing/);
  assert.throws(() => parseConcurrencyLevels('1,not-a-number'), /comma-separated integers/);
});

test('phase 3 keeps ramp, duration, rate, and in-flight limits bounded', () => {
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_REQUESTS_PER_LEVEL: '101' }), /between 10 and 100/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_WARMUP_REQUESTS: '4' }), /between 0 and 3/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_SUSTAINED_DURATION_SECONDS: '301' }), /between 30 and 300/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_SUSTAINED_RPS: '11' }), /between 1 and 10/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_SUSTAINED_MAX_IN_FLIGHT: '11' }), /between 1 and 10/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, PHASE3_ENABLE_SUSTAINED: 'yes' }), /must be true or false/);
});

test('phase 3 enforces HTTPS and rejects URL credentials or unexpected hosts', () => {
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'http://example.com/__internal/db-probe',
  }), /Only \*\.workers\.dev or localhost/);
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'https://user:pass@probe.example.workers.dev/__internal/db-probe',
  }), /must not contain credentials/);
});

test('percentile and summary calculations handle values and empty samples', () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
  assert.equal(percentile([], 0.95), null);
  assert.deepEqual(summarize([10, 20, 30, 40]), {
    count: 4,
    min: 10,
    mean: 25,
    p50: 20,
    p95: 40,
    p99: 40,
    max: 40,
  });
});

test('sustained scheduler observes configured request rate and in-flight cap', async () => {
  const result = await runSustainedStage({
    sustainedDurationSeconds: 1,
    sustainedRps: 5,
    sustainedMaxInFlight: 2,
  }, async () => {
    await wait(30);
    return {
      ok: true,
      status: 200,
      error: null,
      clientLatencyMs: 30,
      connectDurationMs: 5,
      queryDurationMs: 4,
      workerTotalDurationMs: 10,
    };
  });

  assert.ok(result.attempts >= 4 && result.attempts <= 5);
  assert.equal(result.failures, 0);
  assert.ok(result.maxObservedInFlight <= 2);
  assert.equal(result.targetRequestsPerSecond, 5);
  assert.equal(result.minuteBuckets.length, 1);
});

test('sustained scheduler stops launching requests after repeated failures', async () => {
  let callCount = 0;
  const result = await runSustainedStage({
    sustainedDurationSeconds: 5,
    sustainedRps: 10,
    sustainedMaxInFlight: 1,
  }, async () => {
    callCount += 1;
    return {
      ok: false,
      status: 503,
      error: 'DATABASE_UNAVAILABLE',
      clientLatencyMs: 5,
      connectDurationMs: null,
      queryDurationMs: null,
      workerTotalDurationMs: null,
    };
  });

  assert.equal(callCount, 3);
  assert.equal(result.attempts, 3);
  assert.equal(result.failures, 3);
  assert.equal(result.stoppedEarly, true);
  assert.match(result.stopReason, /new requests were stopped/);
});
