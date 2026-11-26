import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseConcurrencyLevels,
  parseConfiguration,
  percentile,
  summarize,
} from './compare-connections.mjs';

const validEnvironment = {
  HYPERDRIVE_PROBE_TOKEN: 'x'.repeat(64),
  PHASE5_DIRECT_PROBE_URL: 'https://marketplat-hyperdrive-probe.example.workers.dev/__internal/direct-db-probe',
  PHASE5_HYPERDRIVE_PROBE_URL: 'https://marketplat-hyperdrive-probe.example.workers.dev/__internal/db-probe',
};

test('comparison configuration uses a conservative default load profile', () => {
  const config = parseConfiguration(validEnvironment);
  assert.deepEqual(config.concurrencyLevels, [1, 2]);
  assert.equal(config.requestsPerLevel, 20);
  assert.equal(config.sustainedRps, 2);
  assert.equal(config.sustainedMaxInFlight, 1);
  assert.equal(config.sustainedDurationSeconds, 30);
  assert.equal(config.targets.direct.mode, 'direct');
  assert.equal(config.targets.hyperdrive.mode, 'hyperdrive');
});

test('comparison configuration rejects missing credentials and non-HTTPS remote probes', () => {
  assert.throws(() => parseConfiguration({ ...validEnvironment, HYPERDRIVE_PROBE_TOKEN: '' }), /HYPERDRIVE_PROBE_TOKEN/);
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    PHASE5_DIRECT_PROBE_URL: 'http://marketplat-hyperdrive-probe.example.workers.dev/__internal/direct-db-probe',
  }), /HTTPS/);
});

test('comparison configuration rejects credentials in target URLs and unexpected paths', () => {
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    PHASE5_DIRECT_PROBE_URL: 'https://user:pass@marketplat-hyperdrive-probe.example.workers.dev/__internal/direct-db-probe',
  }), /must not contain credentials/);
  assert.throws(() => parseConfiguration({
    ...validEnvironment,
    PHASE5_DIRECT_PROBE_URL: 'https://marketplat-hyperdrive-probe.example.workers.dev/health',
  }), /path must be exactly/);
});

test('comparison configuration bounds direct connection concurrency to the safe profile', () => {
  assert.throws(() => parseConcurrencyLevels('1,2,10'), /between 1 and 5/);
  assert.throws(() => parseConcurrencyLevels('1,1'), /unique/);
  assert.throws(() => parseConcurrencyLevels('2,1'), /strictly increasing/);
});

test('percentile and summary calculate p50, p95 and p99 without mutating inputs', () => {
  const values = [5, 1, 4, 2, 3];
  assert.equal(percentile(values, 0.5), 3);
  assert.equal(percentile(values, 0.95), 5);
  assert.equal(percentile(values, 0.99), 5);
  assert.deepEqual(values, [5, 1, 4, 2, 3]);
  assert.deepEqual(summarize([1, 2, 3]), {
    count: 3,
    min: 1,
    mean: 2,
    p50: 2,
    p95: 3,
    p99: 3,
    max: 3,
  });
});
