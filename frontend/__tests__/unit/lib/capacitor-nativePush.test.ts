/**
 * __tests__/unit/lib/capacitor-nativePush.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('nativePush', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('isNativePushSupported is false on web', async () => {
    const { isNativePushSupported } = await import('@/lib/capacitor/nativePush');
    await expect(isNativePushSupported()).resolves.toBe(false);
  });

  it('registerNativePush returns null on web', async () => {
    const { registerNativePush } = await import('@/lib/capacitor/nativePush');
    await expect(registerNativePush()).resolves.toBeNull();
  });

  it('unregisterNativePush is no-op on web', async () => {
    const { unregisterNativePush } = await import('@/lib/capacitor/nativePush');
    await expect(unregisterNativePush('token')).resolves.toBeUndefined();
  });

  it('onNativePushTapped returns cleanup noop on web', async () => {
    const { onNativePushTapped } = await import('@/lib/capacitor/nativePush');
    const cleanup = await onNativePushTapped(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
