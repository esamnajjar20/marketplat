import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  STORAGE_WARNING_RATIO,
  STORAGE_CRITICAL_RATIO,
  getStorageEstimate,
  shouldPauseBackgroundWarming,
} from '@/lib/offlineStoragePressure';

let usage = 0;
let quota = 1000;
const cacheNames = new Set<string>();

beforeEach(() => {
  usage = 100;
  quota = 1000;
  cacheNames.clear();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        estimate: vi.fn(async () => ({ usage, quota })),
      },
    },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      keys: vi.fn(async () => [...cacheNames]),
      delete: vi.fn(async (name: string) => cacheNames.delete(name)),
    },
  });
});

describe('offline storage pressure', () => {
  it('classifies warning and critical thresholds', async () => {
    usage = quota * STORAGE_WARNING_RATIO;
    expect((await getStorageEstimate()).pressure).toBe('warning');

    usage = quota * STORAGE_CRITICAL_RATIO;
    expect((await getStorageEstimate()).pressure).toBe('critical');
  });

  it('does not pause warming below the critical threshold', async () => {
    usage = 850;
    expect(await shouldPauseBackgroundWarming()).toBe(false);
  });

  it('pauses warming at critical pressure after requesting SW trim (usage still critical)', async () => {
    // Client no longer deletes caches itself — it posts TRIM_DISPOSABLE_CACHES
    // to the service worker. With usage still critical after that request,
    // shouldPauseBackgroundWarming must return true.
    usage = 950;
    cacheNames.add('market-auto-read-ads');
    cacheNames.add('market-images-v44');
    cacheNames.add('market-api-v44');
    cacheNames.add('market-saved-ads');
    cacheNames.add('market-user-data-v44');

    // No active SW in this unit test → cleanup is a no-op; pressure stays critical.
    expect(await shouldPauseBackgroundWarming()).toBe(true);
    // Cache names are untouched client-side (SW owns eviction).
    expect(cacheNames.has('market-saved-ads')).toBe(true);
    expect(cacheNames.has('market-user-data-v44')).toBe(true);
  });
});
