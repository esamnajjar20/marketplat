/**
 * __tests__/unit/lib/capacitor-platform.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

describe('capacitor/platform', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('isNativePlatform returns false on web', async () => {
    const { isNativePlatform } = await import('@/lib/capacitor/platform');
    await expect(isNativePlatform()).resolves.toBe(false);
  });

  it('getNativePlatformName returns web by default', async () => {
    const { getNativePlatformName } = await import('@/lib/capacitor/platform');
    await expect(getNativePlatformName()).resolves.toBe('web');
  });
});
