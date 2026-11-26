import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseConcurrencyLevels,
  parseConfiguration,
  percentile,
  summarize,
} from './benchmark.mjs';

const validEnvironment = {
  HYPERDRIVE_PROBE_URL: 'https://marketplat-hyperdrive-probe.example.workers.dev/__internal/db-probe',
  HYPERDRIVE_PROBE_TOKEN: 'x'.repeat(64),
};

test('configuration defaults to a bounded 1/2/5 concurrency ramp', () => {
  const config = parseConfiguration(validEnvironment);
  assert.deepEqual(config.concurrencyLevels, [1, 2, 5]);
  assert.equal(config.requestsPerLevel, 20);
  assert.equal(config.warmupRequests, 2);
});

test('configuration rejects non-HTTPS or unexpected target hosts by default', () => {
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'http://example.com/__internal/db-probe',
  }), /Only \*\.workers\.dev or localhost/);
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'https://example.com/__internal/db-probe',
  }), /Only \*\.workers\.dev or localhost/);
});

test('configuration rejects credentials and paths other than the probe endpoint', () => {
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'https://user:pass@probe.example.workers.dev/__internal/db-probe',
  }), /must not contain credentials/);
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    HYPERDRIVE_PROBE_URL: 'https://probe.example.workers.dev/health',
  }), /path must be exactly/);
});

test('configuration enforces token, request, warm-up, and concurrency bounds', () => {
  assert.throws(() => parseConfiguration({ ...validEnvironment, HYPERDRIVE_PROBE_TOKEN: 'short' }), /32–512/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, BENCHMARK_REQUESTS_PER_LEVEL: '51' }), /between 5 and 50/);
  assert.throws(() => parseConfiguration({ ...validEnvironment, BENCHMARK_WARMUP_REQUESTS: '4' }), /between 0 and 3/);
  assert.throws(() => parseConcurrencyLevels('1,6'), /between 1 and 5/);
  assert.throws(() => parseConcurrencyLevels('1,1'), /unique levels/);
});

test('percentile uses nearest-rank calculation and handles empty values', () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
  assert.equal(percentile([], 0.95), null);
});

test('summary reports stable latency statistics', () => {
  assert.deepEqual(summarize([10, 20, 30, 40]), {
    count: 4,
    min: 10,
    mean: 25,
    p50: 20,
    p95: 40,
    p99: 40,
    max: 40,
  });
  assert.equal(summarize([]).count, 0);
});
