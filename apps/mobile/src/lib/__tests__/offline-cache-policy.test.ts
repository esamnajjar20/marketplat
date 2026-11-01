import { describe, expect, it } from 'vitest';
import { canUseStaleCacheAfterReadFailure } from '@/lib/offline-cache-policy';

describe('offline cache fallback policy', () => {
  it('allows transport, server, and rate-limit fallback', () => {
    expect(canUseStaleCacheAfterReadFailure(new Error('Network request failed'))).toBe(true);
    expect(canUseStaleCacheAfterReadFailure({ status: undefined, code: 'REQUEST_TIMEOUT' })).toBe(true);
    expect(canUseStaleCacheAfterReadFailure({ status: 503 })).toBe(true);
    expect(canUseStaleCacheAfterReadFailure({ status: 429 })).toBe(true);
  });

  it('never masks explicit client or authorization errors', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(canUseStaleCacheAfterReadFailure({ status })).toBe(false);
    }
  });

  it('never turns cancellation into stale success', () => {
    const controller = new AbortController();
    controller.abort();
    expect(canUseStaleCacheAfterReadFailure({ status: undefined, code: 'REQUEST_CANCELLED' })).toBe(false);
    expect(canUseStaleCacheAfterReadFailure({ name: 'AbortError' })).toBe(false);
    expect(canUseStaleCacheAfterReadFailure({ status: undefined }, controller.signal)).toBe(false);
  });
});
