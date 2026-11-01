import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOfflineCacheStatusSnapshot,
  markFreshApiResponse,
  markOfflineCacheResponse,
  subscribeOfflineCacheStatus,
} from '../offline-cache-status';

afterEach(() => {
  // Clear all resources used by this test without exposing mutable state from the module.
  markFreshApiResponse('resource-a');
  markFreshApiResponse('resource-b');
  vi.restoreAllMocks();
});

describe('offline cache notice state', () => {
  it('tracks resources served from snapshots and removes them after a fresh response', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOfflineCacheStatus(listener);
    const savedAt = Date.now() - 60_000;

    markOfflineCacheResponse('resource-a', savedAt);
    expect(getOfflineCacheStatusSnapshot()).toEqual({ count: 1, latestSavedAt: savedAt });
    expect(listener).toHaveBeenCalledTimes(1);

    markOfflineCacheResponse('resource-b', savedAt - 30_000);
    expect(getOfflineCacheStatusSnapshot()).toEqual({ count: 2, latestSavedAt: savedAt });

    markFreshApiResponse('resource-a');
    expect(getOfflineCacheStatusSnapshot()).toEqual({ count: 1, latestSavedAt: savedAt - 30_000 });
    unsubscribe();
  });

  it('ignores empty keys and invalid timestamps', () => {
    markOfflineCacheResponse('', Date.now());
    markOfflineCacheResponse('resource-a', Number.NaN);
    expect(getOfflineCacheStatusSnapshot().count).toBe(0);
  });
});
