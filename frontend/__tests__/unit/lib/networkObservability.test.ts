import { beforeEach, describe, expect, it } from 'vitest';
import {
  getNetworkObservabilitySnapshot,
  recordConnectionSnapshot,
  recordQueueDrainCompleted,
  recordQueueDrainStarted,
  recordRequestCompleted,
  recordRequestRetry,
  recordRequestErrorCode,
  recordRequestStarted,
  recordUploadAttempt,
  recordUploadResult,
  resetNetworkObservabilityForTests,
} from '@/lib/networkObservability';

describe('networkObservability', () => {
  beforeEach(() => resetNetworkObservabilityForTests());

  it('measures request latency and retries without exposing request data', () => {
    recordRequestStarted();
    recordRequestCompleted(900, true);
    recordRequestStarted();
    recordRequestRetry();
    recordRequestCompleted(2100, false, 'http');

    const snapshot = getNetworkObservabilitySnapshot();
    expect(snapshot.requests.total).toBe(2);
    expect(snapshot.requests.successful).toBe(1);
    expect(snapshot.requests.failed).toBe(1);
    expect(snapshot.requests.networkFailures).toBe(0);
    expect(snapshot.requests.httpFailures).toBe(1);
    expect(snapshot.requests.retries).toBe(1);
    recordRequestErrorCode('RATE_LIMIT_EXCEEDED');
    recordRequestErrorCode('RATE_LIMIT_EXCEEDED');
    expect(getNetworkObservabilitySnapshot().requests.errorsByCode).toEqual({ RATE_LIMIT_EXCEEDED: 2 });
    expect(snapshot.requests.averageMs).toBe(1500);
    expect(snapshot.requests.p95Ms).toBe(2100);
    expect(JSON.stringify(snapshot)).not.toContain('Authorization');
  });

  it('keeps request totals consistent and separates network from HTTP failures', () => {
    recordRequestStarted();
    recordRequestCompleted(700, false, 'network');
    recordRequestStarted();
    recordRequestCompleted(400, false, 'http');
    recordRequestStarted();
    recordRequestCompleted(30, true);

    const snapshot = getNetworkObservabilitySnapshot();
    expect(snapshot.requests.total).toBe(3);
    expect(snapshot.requests.successful + snapshot.requests.failed).toBe(snapshot.requests.total);
    expect(snapshot.requests.networkFailures).toBe(1);
    expect(snapshot.requests.httpFailures).toBe(1);
  });

  it('records upload failures separately from request failures', () => {
    recordUploadAttempt();
    recordUploadResult(false);
    recordUploadAttempt();
    recordUploadResult(true);

    const snapshot = getNetworkObservabilitySnapshot();
    expect(snapshot.uploads).toMatchObject({ attempts: 2, successful: 1, failed: 1 });
    expect(snapshot.uploads.lastFailureAt).toEqual(expect.any(Number));
  });

  it('records queue drain duration and partial/offline results', () => {
    recordQueueDrainStarted();
    recordQueueDrainCompleted({ durationMs: 3200, sent: 3, failed: 1, stillOffline: true });

    const snapshot = getNetworkObservabilitySnapshot();
    expect(snapshot.queue).toMatchObject({
      drains: 1,
      completedDrains: 1,
      itemsSent: 3,
      itemsFailed: 1,
      stillOffline: 1,
      lastDrainDurationMs: 3200,
    });
  });

  it('captures actual connection measurements', () => {
    recordConnectionSnapshot({
      tier: 'very-slow',
      effectiveType: '2g',
      downlinkMbps: 0.2,
      rttMs: 900,
      saveData: true,
      consecutiveFailures: 2,
    });

    expect(getNetworkObservabilitySnapshot().connection).toEqual({
      tier: 'very-slow',
      effectiveType: '2g',
      downlinkMbps: 0.2,
      rttMs: 900,
      saveData: true,
      consecutiveFailures: 2,
    });
  });
});
