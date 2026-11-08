import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSetting = vi.hoisted(() => vi.fn());
vi.mock('@/api/admin.api', () => ({
  adminApi: { getDeveloperToolsSetting: getSetting },
}));

import {
  __resetAdminDeveloperToolsSettingForTests,
  loadAdminDeveloperToolsSetting,
  publishAdminDeveloperToolsSetting,
} from '@/lib/adminDeveloperToolsSetting';

const setting = { enabled: true, updatedAt: null, backendDevelopmentMode: false };

beforeEach(() => {
  __resetAdminDeveloperToolsSettingForTests();
  getSetting.mockReset();
  getSetting.mockResolvedValue({ data: { data: setting } });
});

describe('admin developer-tools setting cache', () => {
  it('coalesces simultaneous readers and reuses the five-minute snapshot', async () => {
    const [first, second] = await Promise.all([
      loadAdminDeveloperToolsSetting(),
      loadAdminDeveloperToolsSetting(),
    ]);
    const third = await loadAdminDeveloperToolsSetting();

    expect(first.value.enabled).toBe(true);
    expect(second.value.enabled).toBe(true);
    expect(third.stale).toBe(false);
    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it('keeps the last known value if a later refresh fails', async () => {
    await loadAdminDeveloperToolsSetting();
    getSetting.mockRejectedValueOnce(new Error('temporary server error'));
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    const refreshed = await loadAdminDeveloperToolsSetting();

    expect(refreshed.value.enabled).toBe(true);
    expect(refreshed.stale).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('publishes a successful setting change to other consumers', () => {
    const changed = vi.fn();
    window.addEventListener('developer-tools-setting-changed', changed);

    publishAdminDeveloperToolsSetting({ ...setting, enabled: false });

    expect(changed).toHaveBeenCalledTimes(1);
    expect((changed.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ enabled: false });
    window.removeEventListener('developer-tools-setting-changed', changed);
  });
});
