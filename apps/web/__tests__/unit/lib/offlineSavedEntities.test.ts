import { beforeEach, describe, expect, it, vi } from 'vitest';

const { records, localSetResult, fetchWithTimeout } = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  localSetResult: { value: true },
  fetchWithTimeout: vi.fn(),
}));

vi.mock('@/lib/localStore', () => ({
  localGet: (key: string, fallback: unknown) => records.has(key) ? records.get(key) : fallback,
  localSet: (key: string, value: unknown) => {
    if (!localSetResult.value) return false;
    records.set(key, value);
    return true;
  },
}));
vi.mock('@/lib/constants', () => ({ API_BASE_URL: '/api/v1' }));
vi.mock('@/lib/fetchTimeout', () => ({ fetchWithTimeout }));

import {
  listSavedEntities,
  checkSavedEntityCacheStatus,
  saveEntityOffline,
  unsaveEntityOffline,
  SAVED_ENTITIES_CACHE,
  type SavedEntityMeta,
} from '@/lib/offlineSavedEntities';

const INDEX_KEY = 'saved-ads-offline';
const savedEntity = (id: string, imageUrls: string[] = []): SavedEntityMeta => ({
  type: 'ad', id, userId: 'user-a', title: `Ad ${id}`, subtitle: null, city: null,
  thumbnail: imageUrls[0] ?? null, savedAt: new Date().toISOString(), imageUrls,
});

function setupCache() {
  const entries = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (key: string, response: Response) => { entries.set(key, response); }),
    match: vi.fn(async (key: string) => entries.get(key)),
    delete: vi.fn(async (key: string) => entries.delete(key)),
  };
  vi.stubGlobal('caches', { open: vi.fn(async (name: string) => {
    expect(name).toBe(SAVED_ENTITIES_CACHE);
    return cache;
  }) });
  return { cache, entries };
}

describe('offline saved entities persistence and cache cleanup', () => {
  beforeEach(() => {
    records.clear();
    localSetResult.value = true;
    fetchWithTimeout.mockReset();
    fetchWithTimeout.mockImplementation(async (url: string) => new Response(
      url.includes('images.example') ? 'image-bytes' : '{"id":"public"}',
      { status: 200, headers: { 'content-type': url.includes('images.example') ? 'image/jpeg' : 'application/json' } },
    ));
    vi.unstubAllGlobals();
  });

  it('does not report saved when the local index write fails and cleans only new orphaned artifacts', async () => {
    const { cache } = setupCache();
    localSetResult.value = false;

    const ok = await saveEntityOffline('ad', {
      id: 'ad-1', title: 'Ad 1', thumbnail: 'https://images.example/ad-1.jpg',
    }, 'user-a');

    expect(ok).toBe(false);
    expect(listSavedEntities()).toEqual([]);
    expect(cache.delete).toHaveBeenCalledWith(new URL('/api/v1/ads/ad-1', window.location.href).href);
    expect(cache.delete).toHaveBeenCalledWith('https://images.example/ad-1.jpg');
  });

  it('stores relative API endpoints under the same absolute URL the service worker requests', async () => {
    const { cache, entries } = setupCache();

    const ok = await saveEntityOffline('ad', { id: 'relative-ad', title: 'Relative API URL' }, 'user-a');

    const canonicalUrl = new URL('/api/v1/ads/relative-ad', window.location.href).href;
    expect(ok).toBe(true);
    expect(cache.put).toHaveBeenCalledWith(canonicalUrl, expect.any(Response));
    expect(entries.has(canonicalUrl)).toBe(true);
  });

  it('does not cache an oversized inspectable image even when Content-Length is absent', async () => {
    const { cache, entries } = setupCache();
    fetchWithTimeout
      .mockResolvedValueOnce(new Response('{"id":"large-image"}', {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('x'.repeat(2.5 * 1024 * 1024 + 1), {
        status: 200, headers: { 'content-type': 'image/jpeg' },
      }));

    const ok = await saveEntityOffline('ad', {
      id: 'large-image', title: 'Large image', thumbnail: 'https://images.example/large.jpg',
    }, 'user-a');

    expect(ok).toBe(true); // Image failure is best-effort; the API snapshot remains usable.
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect([...entries.keys()]).toEqual([new URL('/api/v1/ads/large-image', window.location.href).href]);
  });

  it('does not cache an empty image response', async () => {
    const { cache, entries } = setupCache();
    fetchWithTimeout
      .mockResolvedValueOnce(new Response('{"id":"empty-image"}', {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 200, headers: { 'content-type': 'image/jpeg' },
      }));

    const ok = await saveEntityOffline('ad', {
      id: 'empty-image', title: 'Empty image', thumbnail: 'https://images.example/empty.jpg',
    }, 'user-a');

    expect(ok).toBe(true);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect([...entries.keys()]).toEqual([new URL('/api/v1/ads/empty-image', window.location.href).href]);
  });

  it('reports a missing cached API snapshot without deleting saved metadata', async () => {
    const { cache } = setupCache();
    records.set(INDEX_KEY, [savedEntity('missing-snapshot')]);

    await expect(checkSavedEntityCacheStatus({ type: 'ad', id: 'missing-snapshot' })).resolves.toBe('missing');
    expect(listSavedEntities()).toHaveLength(1);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('reports available when the cached API snapshot exists', async () => {
    const { cache, entries } = setupCache();
    const url = new URL('/api/v1/ads/cached-snapshot', window.location.href).href;
    entries.set(url, new Response('{"id":"cached-snapshot"}', { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(checkSavedEntityCacheStatus({ type: 'ad', id: 'cached-snapshot' })).resolves.toBe('available');
    expect(cache.match).toHaveBeenCalledWith(url);
  });

  it('rejects a successful HTML response as an API snapshot', async () => {
    const { entries } = setupCache();
    fetchWithTimeout.mockResolvedValueOnce(new Response('<html>sign in</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    }));

    const ok = await saveEntityOffline('ad', { id: 'html-not-json', title: 'Bad snapshot' }, 'user-a');

    expect(ok).toBe(false);
    expect(listSavedEntities()).toEqual([]);
    expect(entries.size).toBe(0);
  });

  it('reports a cached non-JSON response as missing rather than available', async () => {
    const { entries } = setupCache();
    const url = new URL('/api/v1/ads/html-snapshot', window.location.href).href;
    entries.set(url, new Response('<html>offline shell</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    }));

    await expect(checkSavedEntityCacheStatus({ type: 'ad', id: 'html-snapshot' })).resolves.toBe('missing');
  });

  it('preserves both index entries when two saves finish concurrently', async () => {
    setupCache();

    const [first, second] = await Promise.all([
      saveEntityOffline('ad', { id: 'parallel-a', title: 'Parallel A' }, 'user-a'),
      saveEntityOffline('product', { id: 'parallel-b', title: 'Parallel B' }, 'user-a'),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(listSavedEntities().map((entry) => `${entry.type}:${entry.id}`).sort()).toEqual([
      'ad:parallel-a',
      'product:parallel-b',
    ]);
  });

  it('cleans evicted entries but keeps images still referenced by another saved entity', async () => {
    const { cache } = setupCache();
    const rows = Array.from({ length: 60 }, (_, i) => savedEntity(
      `ad-${i}`,
      i === 0 ? ['https://images.example/shared.jpg'] : i === 59
        ? ['https://images.example/evicted.jpg', 'https://images.example/shared.jpg']
        : [],
    ));
    records.set(INDEX_KEY, rows);

    const ok = await saveEntityOffline('ad', {
      id: 'new-ad', title: 'New ad', thumbnail: 'https://images.example/new.jpg',
    }, 'user-a');

    expect(ok).toBe(true);
    expect(listSavedEntities()).toHaveLength(60);
    expect(listSavedEntities().some((entry) => entry.id === 'ad-59')).toBe(false);
    expect(cache.delete).toHaveBeenCalledWith(new URL('/api/v1/ads/ad-59', window.location.href).href);
    expect(cache.delete).toHaveBeenCalledWith('https://images.example/evicted.jpg');
    expect(cache.delete).not.toHaveBeenCalledWith('https://images.example/shared.jpg');
  });

  it('does not delete cached resources when removing an item cannot update the index', async () => {
    const { cache } = setupCache();
    records.set(INDEX_KEY, [savedEntity('ad-1', ['https://images.example/ad-1.jpg'])]);
    localSetResult.value = false;

    const ok = await unsaveEntityOffline('ad', 'ad-1', 'user-a');

    expect(ok).toBe(false);
    expect(listSavedEntities()).toHaveLength(1);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('reports success only after the index is removed and then cleans its artifacts', async () => {
    const { cache } = setupCache();
    records.set(INDEX_KEY, [savedEntity('ad-1', ['https://images.example/ad-1.jpg'])]);

    const ok = await unsaveEntityOffline('ad', 'ad-1', 'user-a');

    expect(ok).toBe(true);
    expect(listSavedEntities()).toEqual([]);
    expect(cache.delete).toHaveBeenCalledWith(new URL('/api/v1/ads/ad-1', window.location.href).href);
    expect(cache.delete).toHaveBeenCalledWith('https://images.example/ad-1.jpg');
  });

  it('treats removing an already-absent entity as an idempotent success', async () => {
    setupCache();

    await expect(unsaveEntityOffline('ad', 'missing-ad', 'user-a')).resolves.toBe(true);
  });
});
