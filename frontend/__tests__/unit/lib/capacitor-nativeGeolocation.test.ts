/**
 * __tests__/unit/lib/capacitor-nativeGeolocation.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

describe('nativeGeolocation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when not native', async () => {
    const { getNativeCoordinates } = await import('@/lib/capacitor/nativeGeolocation');
    await expect(getNativeCoordinates()).resolves.toBeNull();
  });
});
