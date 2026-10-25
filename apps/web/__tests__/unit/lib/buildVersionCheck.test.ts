import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBuildVersion } from '@/lib/buildVersionCheck';

const reload = vi.fn();
const unregister = vi.fn(async () => true);
const deleted: string[] = [];
let visibility: 'visible' | 'hidden' = 'visible';

beforeEach(() => {
  localStorage.clear();
  deleted.length = 0;
  reload.mockClear();
  unregister.mockClear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ buildId: 'b2' }) })));
  vi.stubGlobal('caches', {
    keys: async () => [
      'market-static-v86', 'market-saved-ads', 'market-images-v86', 'market-core-v86',
      'market-user-data-v86-u1', 'market-personal-shell-v86', 'market-api-v86',
    ],
    delete: async (k: string) => { deleted.push(k); return true; },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: async () => [{ unregister }] },
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('checkBuildVersion', () => {
  it('REGRESSION: first visit stores the id without purging or reloading', async () => {
    await checkBuildVersion();
    expect(localStorage.getItem('marketplat:build-id')).toBe('b2');
    expect(unregister).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('on a real deploy purges ONLY the static shell cache, keeps SW and user/offline data', async () => {
    localStorage.setItem('marketplat:build-id', 'b1');
    await checkBuildVersion();
    expect(deleted).toEqual(['market-static-v86']);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('does not reload while the tab is in use; reloads once when it becomes hidden', async () => {
    localStorage.setItem('marketplat:build-id', 'b1');
    await checkBuildVersion();
    expect(reload).not.toHaveBeenCalled();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads right away if the tab is already hidden', async () => {
    localStorage.setItem('marketplat:build-id', 'b1');
    visibility = 'hidden';
    await checkBuildVersion();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the id is unchanged', async () => {
    localStorage.setItem('marketplat:build-id', 'b2');
    await checkBuildVersion();
    expect(reload).not.toHaveBeenCalled();
  });
});
