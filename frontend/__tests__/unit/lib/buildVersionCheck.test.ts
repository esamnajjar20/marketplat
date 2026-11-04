import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBuildVersion } from '@/lib/buildVersionCheck';

const reload = vi.fn();
const deleted: string[] = [];
let visibility: 'visible' | 'hidden' = 'visible';

beforeEach(() => {
  localStorage.clear();
  deleted.length = 0;
  reload.mockClear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ buildId: 'b2' }) })));
  vi.stubGlobal('caches', {
    keys: async () => ['market-static-v86', 'market-saved-ads', 'market-images-v86'],
    delete: async (key: string) => { deleted.push(key); return true; },
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('checkBuildVersion', () => {
  it('first visit stores the id without purging or reloading', async () => {
    await checkBuildVersion();
    expect(localStorage.getItem('marketplat:build-id')).toBe('b2');
    expect(deleted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('detects a deploy but preserves offline caches and the active document', async () => {
    localStorage.setItem('marketplat:build-id', 'b1');
    const changed = vi.fn();
    window.addEventListener('marketplat:build-version-changed', changed);

    await checkBuildVersion();

    expect(localStorage.getItem('marketplat:build-id')).toBe('b2');
    expect(deleted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    expect(reload).not.toHaveBeenCalled();
    window.removeEventListener('marketplat:build-version-changed', changed);
  });

  it('does nothing when the id is unchanged', async () => {
    localStorage.setItem('marketplat:build-id', 'b2');
    await checkBuildVersion();
    expect(reload).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('does not request build metadata while the device is offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await checkBuildVersion();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('marketplat:build-id')).toBeNull();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });
});
