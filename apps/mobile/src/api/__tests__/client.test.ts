import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  readPublicCacheEntry: vi.fn(),
  writePublicCache: vi.fn(),
  clearPrivateCache: vi.fn(),
  clearPrivateCacheForPrefix: vi.fn(),
  deletePublicCacheEntry: vi.fn(),
}));

vi.mock('@/storage/public-cache', () => cache);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.marketplat.test');
  cache.readPublicCacheEntry.mockResolvedValue(null);
  cache.writePublicCache.mockResolvedValue(undefined);
  cache.clearPrivateCache.mockResolvedValue(undefined);
  cache.clearPrivateCacheForPrefix.mockResolvedValue(undefined);
  cache.deletePublicCacheEntry.mockResolvedValue(undefined);
});

function jsonResponse(status: number, payload: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

async function loadClient() {
  return import('../client');
}

describe('apiRequest reliability contracts', () => {
  it('serves the validated stale public cache after one bounded 5xx retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'unavailable' }))
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'unavailable' }));
    vi.stubGlobal('fetch', fetchMock);
    cache.readPublicCacheEntry.mockResolvedValue({ value: { success: true, data: [{ id: 'cached-ad' }] }, savedAt: Date.now() - 60_000 });

    const { apiRequest } = await loadClient();
    const result = await apiRequest<{ success: true; data: unknown[]; __fromCache?: true }>('/api/v1/categories');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.__fromCache).toBe(true);
    expect(result.__cachedAt).toBeLessThan(Date.now());
    expect(result.__staleForMs).toBeGreaterThanOrEqual(60_000);
  });

  it('does not turn a caller cancellation into stale-cache success', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    cache.readPublicCacheEntry.mockResolvedValue({ value: { success: true, data: [{ id: 'must-not-be-used' }] }, savedAt: Date.now() });
    const controller = new AbortController();
    controller.abort();

    const { apiRequest } = await loadClient();
    await expect(apiRequest('/api/v1/categories', { signal: controller.signal })).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    });
    expect(cache.readPublicCacheEntry).not.toHaveBeenCalled();
  });

  it('exposes Retry-After for a rate-limited request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(429, { message: 'Too many requests' }, { 'retry-after': '45' }),
    ));
    const { apiRequest } = await loadClient();

    await expect(apiRequest('/api/v1/categories')).rejects.toMatchObject({
      status: 429,
      errorMeta: { retryAfterSeconds: 45 },
    });
  });

  it('does not mislabel every server message containing password as a password-input error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(423, { message: 'Too many password attempts; account locked for 15 minutes' }),
    ));
    const { apiRequest } = await loadClient();

    await expect(apiRequest('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({}) }))
      .rejects.toMatchObject({ message: 'تم قفل الحساب مؤقتًا بسبب كثرة محاولات الدخول. انتظر قليلًا ثم حاول مجددًا.' });
  });
});
