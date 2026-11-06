import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServerApi, ServerApiHttpError } from '@/lib/server/serverApiFetch';
import { getPublicApiCacheTags } from '@/lib/server/serverCacheTags';

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn((
    fn: (...args: unknown[]) => unknown,
    _keyParts?: string[],
    _options?: { revalidate?: number; tags?: string[] },
  ) => fn),
  getCloudflareContext: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: mocks.unstableCache }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mocks.getCloudflareContext }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchServerApi', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    mocks.unstableCache.mockClear();
    mocks.getCloudflareContext.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reads public API data using the unified transport and its registered tags', async () => {
    const responseBody = { success: true, message: 'ok', data: [{ id: 'c1' }] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(responseBody));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchServerApi<{ id: string }[]>('/categories', {
      mode: 'public',
      revalidateSeconds: 300,
      tags: getPublicApiCacheTags('/categories'),
    });

    expect(result.data).toEqual([{ id: 'c1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/categories');
    // Persistence is provided by unstable_cache, not browser/shared HTTP cache.
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('attaches the requested revalidation period and invalidation tags to Next Data Cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: [] }),
    ));

    await fetchServerApi('/categories', {
      mode: 'public',
      revalidateSeconds: 300,
      tags: getPublicApiCacheTags('/categories'),
    });

    expect(mocks.unstableCache).toHaveBeenCalledTimes(1);
    const options = mocks.unstableCache.mock.calls[0][2];
    expect(options).toMatchObject({ revalidate: 300, tags: ['route:categories', 'api'] });
  });

  it('uses the Cloudflare API_WORKER Service Binding in production SSR', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const bindingFetch = vi.fn(async (_request: Request) =>
      jsonResponse({ success: true, message: 'ok', data: [{ id: 'bound' }] }),
    );
    mocks.getCloudflareContext.mockReturnValue({ env: { API_WORKER: { fetch: bindingFetch } } });
    const originFetch = vi.fn();
    vi.stubGlobal('fetch', originFetch);

    const result = await fetchServerApi<{ id: string }[]>('/categories', {
      mode: 'public',
      revalidateSeconds: 300,
      tags: getPublicApiCacheTags('/categories'),
    });

    expect(result.data).toEqual([{ id: 'bound' }]);
    expect(bindingFetch).toHaveBeenCalledTimes(1);
    const request = bindingFetch.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://api/api/v1/categories');
    expect(originFetch).not.toHaveBeenCalled();
  });

  it('fails closed when Cloudflare production has no API_WORKER binding', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.getCloudflareContext.mockReturnValue({ env: {} });
    const originFetch = vi.fn();
    vi.stubGlobal('fetch', originFetch);

    await expect(fetchServerApi('/categories', {
      mode: 'no-store',
    })).rejects.toThrow('فشل الاتصال بالخادم');
    expect(originFetch).not.toHaveBeenCalled();
  });

  it('does not allow a private endpoint to opt into public caching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerApi('/users/me', {
      mode: 'public',
      revalidateSeconds: 60,
      tags: ['api'],
    })).rejects.toThrow('لا تطابق نطاق API العام المسموح');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unregistered public path rather than caching it without an invalidation policy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerApi('/recommendations', {
      mode: 'public',
      revalidateSeconds: 60,
      tags: ['api'],
    })).rejects.toThrow('No public Next cache policy');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps no-store reads available without requiring public tags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', data: { id: 'ad-1' } }),
    ));

    const result = await fetchServerApi<{ id: string }>('/ads/ad-1', { mode: 'no-store' });
    expect(result.data).toEqual({ id: 'ad-1' });
  });

  it('rejects an invalid API response envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    await expect(fetchServerApi('/categories', {
      mode: 'public',
      revalidateSeconds: 300,
      tags: getPublicApiCacheTags('/categories'),
    })).rejects.toThrow('استجابة الخادم غير صالحة');
  });

  it('preserves HTTP 404 status so public detail pages can render not-found states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'not found' }, 404)));

    const error = await fetchServerApi('/service-listings/missing', { mode: 'no-store' }).catch((value) => value);

    expect(error).toBeInstanceOf(ServerApiHttpError);
    expect(error).toMatchObject({ statusCode: 404, status: 404 });
  });

  it('preserves server failures instead of converting them into missing-resource errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'unavailable' }, 503)));

    const error = await fetchServerApi('/service-providers/provider-1', { mode: 'no-store' }).catch((value) => value);

    expect(error).toBeInstanceOf(ServerApiHttpError);
    expect(error).toMatchObject({ statusCode: 503, status: 503 });
  });
});
