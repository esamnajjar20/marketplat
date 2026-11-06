import { describe, expect, it } from 'vitest';
import {
  getNetworkRequests,
  NETWORK_REQUESTS_KEY,
  createConcurrentReadTracker,
  parseContentLengthHeader,
  summarizeNetworkRequestsByRoute,
  type NetworkRequestRecord,
} from '@/lib/networkRequestMonitor';

function request(overrides: Partial<NetworkRequestRecord> = {}): NetworkRequestRecord {
  return {
    id: 'request-1',
    startedAt: '2026-11-06T10:00:00.000Z',
    method: 'GET',
    url: '/api/v1/products',
    pageRoute: '/products',
    kind: 'fetch',
    durationMs: 100,
    status: 200,
    outcome: 'success',
    ...overrides,
  };
}

describe('network request payload telemetry', () => {
  it('flags only overlapping identical safe reads and releases their in-flight keys', () => {
    const tracker = createConcurrentReadTracker();
    const first = tracker.begin('GET', '/api/v1/products?city=Gaza&page=1', '/products', 'https://marketplat.test');
    const second = tracker.begin('GET', '/api/v1/products?page=1&city=Gaza', '/products', 'https://marketplat.test');
    const differentFilter = tracker.begin('GET', '/api/v1/products?city=Rafah&page=1', '/products', 'https://marketplat.test');
    const mutation = tracker.begin('POST', '/api/v1/products', '/products', 'https://marketplat.test');

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(differentFilter.duplicate).toBe(false);
    expect(mutation).toEqual({ key: null, duplicate: false });

    tracker.end(first);
    const third = tracker.begin('GET', '/api/v1/products?city=Gaza&page=1', '/products', 'https://marketplat.test');
    expect(third.duplicate).toBe(true);
    tracker.end(second);
    tracker.end(first); // An idempotent second cleanup must not release third.
    const fourth = tracker.begin('GET', '/api/v1/products?city=Gaza&page=1', '/products', 'https://marketplat.test');
    expect(fourth.duplicate).toBe(true);
    tracker.end(fourth);
    tracker.end(third);
    tracker.end(differentFilter);
    const afterAllReleased = tracker.begin('GET', '/api/v1/products?city=Gaza&page=1', '/products', 'https://marketplat.test');
    expect(afterAllReleased.duplicate).toBe(false);
    tracker.end(afterAllReleased);
  });

  it('accepts only non-negative safe integer Content-Length values', () => {
    expect(parseContentLengthHeader('0')).toBe(0);
    expect(parseContentLengthHeader('2048')).toBe(2048);
    expect(parseContentLengthHeader(null)).toBeUndefined();
    expect(parseContentLengthHeader('')).toBeUndefined();
    expect(parseContentLengthHeader('-1')).toBeUndefined();
    expect(parseContentLengthHeader('12.5')).toBeUndefined();
    expect(parseContentLengthHeader('1e6')).toBeUndefined();
    expect(parseContentLengthHeader('9007199254740992')).toBeUndefined();
  });

  it('aggregates request count, failures, cancellations, known bytes and latency by route', () => {
    const summary = summarizeNetworkRequestsByRoute([
      request({ id: 'a', responseBytes: 1024, durationMs: 100 }),
      request({ id: 'b', responseBytes: 512, durationMs: 300, outcome: 'http-error', status: 503, concurrentDuplicate: true }),
      request({ id: 'c', responseBytes: undefined, durationMs: 200, outcome: 'aborted', status: 0 }),
      request({ id: 'd', pageRoute: '/stores/one', responseBytes: 2048 }),
    ]);

    expect(summary).toEqual([
      {
        pageRoute: '/products',
        requestCount: 3,
        failedCount: 1,
        abortedCount: 1,
        concurrentDuplicateCount: 1,
        knownResponseBytes: 1536,
        sizedResponseCount: 2,
        averageDurationMs: 200,
      },
      {
        pageRoute: '/stores/one',
        requestCount: 1,
        failedCount: 0,
        abortedCount: 0,
        concurrentDuplicateCount: 0,
        knownResponseBytes: 2048,
        sizedResponseCount: 1,
        averageDurationMs: 100,
      },
    ]);
  });

  it('does not invent payload size when Content-Length is unavailable', () => {
    const [summary] = summarizeNetworkRequestsByRoute([request()]);
    expect(summary?.knownResponseBytes).toBe(0);
    expect(summary?.sizedResponseCount).toBe(0);
  });

  it('normalizes optional telemetry fields loaded from the local journal', () => {
    window.localStorage.setItem(NETWORK_REQUESTS_KEY, JSON.stringify([
      { ...request(), responseBytes: 'not-a-number', cacheStatus: 'TOKEN=secret' },
      { ...request({ id: 'valid' }), responseBytes: 4096, cacheStatus: 'hit' },
    ]));

    const rows = getNetworkRequests();
    expect(rows[0]?.responseBytes).toBeUndefined();
    expect(rows[0]?.cacheStatus).toBeUndefined();
    expect(rows[0]?.concurrentDuplicate).toBeUndefined();
    expect(rows[1]?.responseBytes).toBe(4096);
    expect(rows[1]?.cacheStatus).toBe('HIT');
    expect(rows[1]?.concurrentDuplicate).toBeUndefined();
    window.localStorage.removeItem(NETWORK_REQUESTS_KEY);
  });

});
