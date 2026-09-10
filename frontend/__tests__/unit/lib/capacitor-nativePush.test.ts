/**
 * __tests__/unit/lib/capacitor-nativePush.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/capacitor/nativePush';
import { isNativePlatform } from '@/lib/capacitor/platform';

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

describe('nativePush', () => {
  beforeEach(() => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
  });

  it('permission state is unsupported on web', async () => {
    const state = await getNativePushPermissionState();
    expect(state).toBe('unsupported');
  });

  it('registerNativePush returns null on web', async () => {
    expect(await registerNativePush()).toBeNull();
  });

  it('unregisterNativePush is no-op on web', async () => {
    await expect(unregisterNativePush('token')).resolves.toBeUndefined();
  });
});
