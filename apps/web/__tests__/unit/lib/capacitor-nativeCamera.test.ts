/**
 * __tests__/unit/lib/capacitor-nativeCamera.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

describe('nativeCamera', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when not on native platform', async () => {
    const { takeOrPickNativePhoto } = await import('@/lib/capacitor/nativeCamera');
    await expect(takeOrPickNativePhoto()).resolves.toBeNull();
  });
});
