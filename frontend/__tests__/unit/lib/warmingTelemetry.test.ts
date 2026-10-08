import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearWarmingTelemetry,
  getWarmingTelemetrySnapshot,
  recordRouteUse,
  recordWarmedRoute,
  recordWarmingJob,
  recordWarmingTransfer,
} from '../../../lib/warmingTelemetry';

describe('warming telemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWarmingTelemetry();
  });

  it('records observed bytes and failed jobs without exposing payloads', () => {
    recordWarmingJob({ id: 'core-data', ok: false, bytes: 1000, source: 'estimated' });
    recordWarmingTransfer('/ads', 2048);
    const snapshot = getWarmingTelemetrySnapshot();
    expect(snapshot.failedJobs).toBe(1);
    expect(snapshot.observedBytes).toBe(2048);
    expect(snapshot.estimatedBytes).toBe(1000);
    expect(JSON.stringify(snapshot.events)).not.toContain('Authorization');
  });

  it('counts a route as useful when it is used after warming', () => {
    recordWarmedRoute('/products', 5000);
    recordRouteUse('/products');
    expect(getWarmingTelemetrySnapshot().usefulRoutes).toBe(1);
  });
});
