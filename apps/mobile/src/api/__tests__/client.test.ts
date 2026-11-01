import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  readPublicCacheEntry: vi.fn(),
  writePublicCache: vi.fn(),
  clearPrivateCache: vi.fn(),
  clearPrivateCacheForPrefix: vi.fn(),
  deletePublicCacheEntry: vi.fn(),
  deletePublicCacheEntriesByPrefix: vi.fn(),
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
  cache.deletePublicCacheEntriesByPrefix.mockResolvedValue(undefined);
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
    const result = await apiRequest<{ success: true; data: unknown[]; __fromCache?: true; __cachedAt?: number; __staleForMs?: number }>('/api/v1/categories');

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

describe('account-scoped offline cache extensions', () => {
  it.each([
    ['/api/v1/customers?page=2&limit=20&q=Ali', 'api-private:owner-a:/api/v1/customers?page=2&limit=20&q=Ali'],
    ['/api/v1/customers/summary', 'api-private:owner-a:/api/v1/customers/summary'],
    ['/api/v1/sales/debts?page=3&limit=20', 'api-private:owner-a:/api/v1/sales/debts?page=3&limit=20'],
    ['/api/v1/sales/debts/summary', 'api-private:owner-a:/api/v1/sales/debts/summary'],
    ['/api/v1/notifications?page=2&limit=50', 'api-private:owner-a:/api/v1/notifications?page=2&limit=50'],
  ])('uses an owner-specific cache key for %s', async (path, expectedKey) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'temporarily unavailable' }))
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'temporarily unavailable' })));
    cache.readPublicCacheEntry.mockResolvedValue({
      value: { success: true, data: [] },
      savedAt: Date.now() - 10_000,
    });

    const { apiRequest } = await loadClient();
    const result = await apiRequest(path, { token: 'token-a', cacheOwnerId: 'owner-a' });

    expect(result).toMatchObject({ success: true, __fromCache: true });
    expect(cache.readPublicCacheEntry).toHaveBeenCalledWith(expectedKey);
  });

  it('never uses an account cache when the owner ID is missing', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'temporarily unavailable' }))
      .mockResolvedValueOnce(jsonResponse(503, { success: false, message: 'temporarily unavailable' })));

    const { apiRequest } = await loadClient();
    await expect(apiRequest('/api/v1/customers?page=1', { token: 'token-a' })).rejects.toMatchObject({ status: 503 });
    expect(cache.readPublicCacheEntry).not.toHaveBeenCalled();
  });

  it('invalidates only the current owner customer cache after a create mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(201, { success: true, data: { id: 'customer-1' } }),
    ));

    const { apiRequest } = await loadClient();
    await apiRequest('/api/v1/customers', {
      method: 'POST',
      token: 'token-a',
      cacheOwnerId: 'owner-a',
      body: JSON.stringify({ name: 'Customer' }),
    });

    expect(cache.clearPrivateCacheForPrefix).toHaveBeenCalledWith('/api/v1/customers', 'owner-a');
    expect(cache.clearPrivateCache).not.toHaveBeenCalled();
  });


  it('invalidates product private snapshots and public product/search read models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: { id: 'product-1' } }),
    ));
    const { apiRequest } = await loadClient();
    await apiRequest('/api/v1/products/product-1', {
      method: 'PATCH', token: 'token-a', cacheOwnerId: 'owner-a', body: JSON.stringify({ title: 'Updated' }),
    });
    expect(cache.clearPrivateCacheForPrefix).toHaveBeenCalledWith('/api/v1/products', 'owner-a');
    expect(cache.clearPrivateCacheForPrefix).toHaveBeenCalledWith('/api/v1/users/me', 'owner-a');
    expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/products');
    expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/search');
    expect(cache.clearPrivateCache).not.toHaveBeenCalled();
  });

  it('never clears another account private cache when a mutation omits cacheOwnerId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: null }),
    ));
    const { apiRequest } = await loadClient();
    await apiRequest('/api/v1/products/product-1', {
      method: 'PATCH', token: 'token-a', body: JSON.stringify({ title: 'Updated' }),
    });
    expect(cache.clearPrivateCacheForPrefix).not.toHaveBeenCalled();
    expect(cache.clearPrivateCache).not.toHaveBeenCalled();
    expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/products');
  });

  it('invalidates only the current owner notifications cache after a read mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: null }),
    ));

    const { apiRequest } = await loadClient();
    await apiRequest('/api/v1/notifications/read-all', {
      method: 'PATCH',
      token: 'token-a',
      cacheOwnerId: 'owner-a',
      body: JSON.stringify({}),
    });

    expect(cache.clearPrivateCacheForPrefix).toHaveBeenCalledWith('/api/v1/notifications', 'owner-a');
    expect(cache.clearPrivateCache).not.toHaveBeenCalled();
  });
});
