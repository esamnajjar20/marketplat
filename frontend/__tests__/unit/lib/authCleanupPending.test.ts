/**
 * PERF-AUTH-CLEANUP-SPLIT: the heavy-store wipe is lazy-loaded; a failed load
 * must leave a durable flag and the next signed-out start must finish the job.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stages = vi.hoisted(() => ({
  clearAutoReadStage: vi.fn().mockResolvedValue(undefined),
  clearOfflineStoresStage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/authCleanupStores', () => stages);

import { runPendingStoreCleanupIfNeeded } from '@/lib/authCleanup';

const KEY = 'marketplat:pending-store-cleanup';

describe('runPendingStoreCleanupIfNeeded', () => {
  beforeEach(() => {
    localStorage.clear();
    stages.clearAutoReadStage.mockClear();
    stages.clearOfflineStoresStage.mockClear();
  });

  it('does nothing when no cleanup is pending', async () => {
    await runPendingStoreCleanupIfNeeded(false);
    expect(stages.clearOfflineStoresStage).not.toHaveBeenCalled();
  });

  it('never wipes while a session is active and keeps the flag', async () => {
    localStorage.setItem(KEY, '1');
    await runPendingStoreCleanupIfNeeded(true);
    expect(stages.clearOfflineStoresStage).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('finishes the wipe on a signed-out start and clears the flag', async () => {
    localStorage.setItem(KEY, '1');
    await runPendingStoreCleanupIfNeeded(false);
    expect(stages.clearAutoReadStage).toHaveBeenCalledTimes(1);
    expect(stages.clearOfflineStoresStage).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps the flag when the wipe fails again', async () => {
    localStorage.setItem(KEY, '1');
    stages.clearOfflineStoresStage.mockRejectedValueOnce(new Error('idb blocked'));
    await runPendingStoreCleanupIfNeeded(false);
    expect(localStorage.getItem(KEY)).toBe('1');
  });
});
