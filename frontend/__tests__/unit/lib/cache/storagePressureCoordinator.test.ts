import { describe, expect, it, vi } from 'vitest';
import { cleanupDisposableOfflineCaches } from '@/lib/offlineStoragePressure';

describe('cache lifecycle coordinator', () => {
  it('delegates disposable cleanup to the active service worker', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: { postMessage }, controller: null }) },
    });
    await expect(cleanupDisposableOfflineCaches()).resolves.toEqual(['service-worker-trim-requested']);
    expect(postMessage).toHaveBeenCalledWith({ type: 'TRIM_DISPOSABLE_CACHES' });
  });
});
