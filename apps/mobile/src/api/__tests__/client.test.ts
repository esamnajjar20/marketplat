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

  it('does not wait for a successful public response to finish writing the local cache', async () => {
    let finishCacheWrite: (() => void) | undefined;
    cache.writePublicCache.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishCacheWrite = resolve;
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: [{ id: 'category-1' }] }),
    ));

    const { apiRequest } = await loadClient();
    await expect(apiRequest('/api/v1/categories')).resolves.toMatchObject({ success: true });
    expect(cache.writePublicCache).toHaveBeenCalledOnce();
    finishCacheWrite?.();
  });

  it('does not spend a second full timeout retrying a timed-out GET', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const promise = new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
      // Attach a no-op catch immediately so an abort fired after the test completes
      // does not surface as an unhandled rejection in Vitest.
      promise.catch(() => undefined);
      return promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { apiRequest } = await loadClient();
      const pending = apiRequest('/api/v1/categories', { timeoutMs: 25 });
      // Register the rejection assertion before advancing fake timers so the
      // timeout rejection is observed immediately, not reported as unhandled.
      const rejection = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
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

  it('replaces a rotated CSRF header when retrying a mutation after 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { updated: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const { apiRequest, setRefreshHandler, setTokenUpdater } = await loadClient();
    const updater = vi.fn();
    setRefreshHandler(async () => ({
      accessToken: 'fresh-access-token',
      csrfToken: 'fresh-csrf-token',
      expiresIn: 900,
    }));
    setTokenUpdater(updater);

    await expect(apiRequest('/api/v1/products/product-1', {
      method: 'PATCH',
      token: 'expired-access-token',
      headers: { 'X-CSRF-Token': 'old-csrf-token', 'X-Offline-Op-Id': 'operation-123' },
      body: JSON.stringify({ title: 'Updated' }),
    })).resolves.toMatchObject({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retriedHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(retriedHeaders.get('X-CSRF-Token')).toBe('fresh-csrf-token');
    expect(retriedHeaders.get('X-Offline-Op-Id')).toBe('operation-123');
    expect(fetchMock.mock.calls[1][1]?.headers).toBeInstanceOf(Headers);
    expect(updater).toHaveBeenCalledWith('fresh-access-token', 'fresh-csrf-token', 900);
  });

  it('does not refresh or replay a forbidden request (403 is authorization, not expiry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { message: 'Forbidden', code: 'NOT_YOUR_RESOURCE' }));
    vi.stubGlobal('fetch', fetchMock);

    const { apiRequest, setRefreshHandler } = await loadClient();
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'new-token', csrfToken: 'new-csrf' });
    setRefreshHandler(refresh);

    await expect(apiRequest('/api/v1/products/other-user-product', {
      method: 'PATCH',
      token: 'valid-token',
      body: JSON.stringify({ title: 'Unauthorized edit' }),
    })).rejects.toMatchObject({ status: 403, code: 'NOT_YOUR_RESOURCE' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not mislabel every server message containing password as a password-input error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(423, { message: 'Too many password attempts; account locked for 15 minutes' }),
    ));
    const { apiRequest } = await loadClient();

    await expect(apiRequest('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({}) }))
      .rejects.toMatchObject({ message: 'تم قفل الحساب مؤقتًا بسبب كثرة محاولات الدخول. انتظر قليلًا ثم حاول مرة أخرى.' });
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
    await vi.waitFor(() => {
      expect(cache.clearPrivateCacheForPrefix).toHaveBeenCalledWith('/api/v1/users/me', 'owner-a');
      expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/products');
      expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/search');
    });
    expect(cache.clearPrivateCache).not.toHaveBeenCalled();
  });

  it('awaits local cache invalidation before resolving a successful mutation', async () => {
    let finishInvalidation!: () => void;
    cache.deletePublicCacheEntriesByPrefix.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishInvalidation = resolve;
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: { id: 'product-1' } }),
    ));

    const { apiRequest } = await loadClient();
    let settled = false;
    const mutation = apiRequest('/api/v1/products/product-1', {
      method: 'PATCH', token: 'token-a', cacheOwnerId: 'owner-a', body: JSON.stringify({ title: 'Updated' }),
    }).finally(() => { settled = true; });
    await vi.waitFor(() => expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalled());
    expect(settled).toBe(false);
    finishInvalidation();
    await mutation;
    expect(settled).toBe(true);
  });

  it('does not let a pre-mutation GET repopulate the local cache after a mutation', async () => {
    let finishGet!: (response: Response) => void;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/products/product-1') && !init?.method) {
        return new Promise<Response>((resolve) => { finishGet = resolve; });
      }
      return Promise.resolve(jsonResponse(200, { success: true, data: { id: 'product-1' } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiRequest } = await loadClient();
    const oldRead = apiRequest('/api/v1/products/product-1');
    await apiRequest('/api/v1/products/product-1', {
      method: 'PATCH', token: 'token-a', cacheOwnerId: 'owner-a', body: JSON.stringify({ title: 'Updated' }),
    });
    finishGet(jsonResponse(200, { success: true, data: { id: 'product-1', title: 'Old title' } }));
    await oldRead;
    expect(cache.writePublicCache).not.toHaveBeenCalled();
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
    await vi.waitFor(() => {
      expect(cache.deletePublicCacheEntriesByPrefix).toHaveBeenCalledWith('api-public:/api/v1/products');
    });
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

  it('rejects writes immediately with OFFLINE (status undefined) while hard-disconnected, without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, ApiError } = await loadClient();
    const { setHardOffline } = await import('@/lib/connectivity-state');
    setHardOffline(true);

    const error = await apiRequest('/api/v1/stories', { method: 'POST', token: 'token-a', body: '{}' }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('OFFLINE');
    // Queue-backed screens enqueue on `status === undefined`; this must stay true.
    expect(error.status).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not block reads while hard-disconnected (cache fallback still applies)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));
    const { apiRequest } = await loadClient();
    const { setHardOffline } = await import('@/lib/connectivity-state');
    setHardOffline(true);

    const error = await apiRequest('/api/v1/ads').catch((e) => e);

    expect(error.code).not.toBe('OFFLINE');
  });
});
