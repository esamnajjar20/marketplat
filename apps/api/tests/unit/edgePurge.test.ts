/**
 * Edge cache purge by Cache-Tag + purge-aware edge TTLs.
 *
 * The tag literals below are pinned identically in
 * workers/cf-api-proxy/cache-policy.test.mjs — if one side changes the tag
 * vocabulary, BOTH tests must change or purges silently stop matching.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHmac } from 'node:crypto';

type EdgeModule = typeof import('../../src/shared/cache/edgePurge');

const loadEdge = (edgePurge: Record<string, unknown>): EdgeModule => {
  let mod!: EdgeModule;
  jest.isolateModules(() => {
    jest.doMock('../../src/config/env', () => ({ env: { edgePurge } }));
    jest.doMock('../../src/shared/utils/logger', () => ({
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
    }));
    mod = require('../../src/shared/cache/edgePurge');
  });
  return mod;
};

const ENABLED = { enabled: true, zoneId: 'zone123', apiToken: 'tok', workerPurgeUrl: '', workerPurgeToken: '' };
const DISABLED = { enabled: false, zoneId: '', apiToken: '', workerPurgeUrl: '', workerPurgeToken: '' };
const WORKER_CACHE_ENABLED = { enabled: true, zoneId: '', apiToken: '', workerPurgeUrl: 'https://api.example.com/__purge__', workerPurgeToken: 's3cret' };
const BOTH_ENABLED = { enabled: true, zoneId: 'zone123', apiToken: 'tok', workerPurgeUrl: 'https://api.example.com/__purge__', workerPurgeToken: 's3cret' };
const NEXT_CACHE_ENABLED = { enabled: true, zoneId: '', apiToken: '', workerPurgeUrl: '', workerPurgeToken: '', nextRevalidationUrl: 'https://marketplat.example/api/internal/cache/revalidate', nextRevalidationSecret: 'a'.repeat(40) };

describe('edge tag vocabulary (parity with the Worker)', () => {
  const edge = loadEdge(DISABLED);

  it('city tags use the same normalisation as the Worker', () => {
    expect(edge.cityTagValue('غزة')).toBe('%D8%BA%D8%B2%D8%A9');
    expect(edge.cityTagValue('خان يونس')).toBe('%D8%AE%D8%A7%D9%86-%D9%8A%D9%88%D9%86%D8%B3');
    expect(edge.cityTagValue('  خان   يونس ')).toBe(edge.cityTagValue('خان يونس'));
  });

  it('hide: ad detail + its city + unfiltered lists + home + search', () => {
    expect(edge.adEdgeTags({ adId: '12345', city: 'غزة', kind: 'hide' }).sort()).toEqual(
      ['ad:12345', 'city:%D8%BA%D8%B2%D8%A9', 'city:any', 'route:home', 'route:search'].sort()
    );
  });

  it('edit: no home/search purge; previous city is purged too', () => {
    expect(
      edge.adEdgeTags({ adId: '9', city: 'رفح', prevCity: 'غزة', kind: 'edit' }).sort()
    ).toEqual(['ad:9', 'city:%D8%BA%D8%B2%D8%A9', 'city:%D8%B1%D9%81%D8%AD', 'city:any'].sort());
  });

  it('city-less ad: only unfiltered lists + detail', () => {
    expect(edge.adEdgeTags({ adId: '9', city: null }).sort()).toEqual(['ad:9', 'city:any']);
  });

  it('unknown city cannot be targeted: purge every ads response', () => {
    expect(edge.adEdgeTags({ kind: 'edit' })).toEqual(['route:ads']);
    expect(edge.adEdgeTags({ adId: '9', kind: 'create' }).sort()).toEqual(
      ['route:ads', 'route:home', 'route:search'].sort()
    );
    expect(edge.adEdgeTags().sort()).toEqual(['route:ads']);
  });
});

describe('purgeEdgeTags transport', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('does nothing (no outbound call) when purging is not configured', async () => {
    const edge = loadEdge(DISABLED);
    edge.purgeAdEdge({ adId: '1', city: 'غزة', kind: 'hide' });
    edge.purgeEdgeTags(['route:ads']);
    await edge.flushEdgePurge();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coalesces a burst of writes into ONE Cloudflare call with de-duplicated tags', async () => {
    const edge = loadEdge(ENABLED);
    edge.purgeAdEdge({ adId: '1', city: 'غزة', kind: 'hide' });
    edge.purgeAdEdge({ adId: '2', city: 'غزة', kind: 'hide' });
    expect(fetchMock).not.toHaveBeenCalled(); // debounced
    await edge.flushEdgePurge();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone123/purge_cache');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const { tags } = JSON.parse(init.body);
    expect([...tags].sort()).toEqual(
      ['ad:1', 'ad:2', 'city:%D8%BA%D8%B2%D8%A9', 'city:any', 'route:home', 'route:search'].sort()
    );
  });

  it('purges the native Workers Cache by tags through the authenticated Worker endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, purgedTags: 2 }) });
    const edge = loadEdge(WORKER_CACHE_ENABLED);
    edge.purgeEdgeTags(['ad:1', 'route:ads']);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/__purge__');
    expect(init.headers['x-purge-token']).toBe('s3cret');
    expect(JSON.parse(init.body)).toEqual({ tags: ['ad:1', 'route:ads'] });
  });

  it('sends an HMAC-signed tag batch to the Next.js Data Cache endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const edge = loadEdge(NEXT_CACHE_ENABLED);
    edge.purgeEdgeTags(['route:products', 'product:product-1']);
    await edge.flushEdgePurge();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(NEXT_CACHE_ENABLED.nextRevalidationUrl);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    const timestamp = init.headers['x-marketplat-timestamp'];
    const body = init.body as string;
    const expected = createHmac('sha256', NEXT_CACHE_ENABLED.nextRevalidationSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    expect(init.headers['x-marketplat-signature']).toBe(`sha256=${expected}`);
    expect(JSON.parse(body)).toEqual({ tags: ['route:products', 'product:product-1'] });
  });

  it('keeps the Next.js target disabled unless both URL and secret exist', async () => {
    const edge = loadEdge({ ...NEXT_CACHE_ENABLED, nextRevalidationSecret: '' });
    edge.purgeEdgeTags(['route:products']);
    await edge.flushEdgePurge();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('purges both native Worker Cache and zone cache when both targets are configured', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, purgedTags: 1 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    const edge = loadEdge(BOTH_ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flushes by itself after the coalescing window', async () => {
    jest.useFakeTimers();
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('splits more than 30 tags into several calls (Cloudflare limit)', async () => {
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(Array.from({ length: 65 }, (_, i) => `ad:${i}`));
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).tags.length);
    expect(sizes).toEqual([30, 30, 5]);
  });

  it('does not treat HTTP 200 with malformed or missing success payload as a completed purge', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: 'accepted' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('invalid JSON'); } })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retains tags when Cloudflare returns HTTP 200 with success:false, then retries on next flush', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false, errors: [{ code: 10000 }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false, errors: [{ code: 10000 }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: false, errors: [{ code: 10000 }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, errors: [] }) });
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await edge.flushEdgePurge();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).tags).toEqual(['route:ads']);
  });

  it('backs off permanent 4xx responses instead of retrying them every 30 seconds', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    await expect(edge.flushEdgePurge()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(270_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('purgeReferenceKv posts to the Worker with the shared token', () => {
    const edge = loadEdge({
      ...ENABLED,
      workerPurgeUrl: 'https://api.example.com/__purge__',
      workerPurgeToken: 's3cret',
    });
    edge.purgeReferenceKv();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/__purge__');
    expect(init.headers['x-purge-token']).toBe('s3cret');
  });

  it('treats HTTP 200 without an explicit ok:true as a failed KV purge', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const edge = loadEdge({
      ...ENABLED,
      workerPurgeUrl: 'https://api.example.com/__purge__',
      workerPurgeToken: 's3cret',
    });
    edge.purgeReferenceKv();
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('purgeReferenceKv is a no-op without URL + token', () => {
    loadEdge(ENABLED).purgeReferenceKv();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('purge-aware edge TTL (only safe once purging works)', () => {
  it('keeps the policy value while purging is off', () => {
    const edge = loadEdge(DISABLED);
    expect(edge.purgeAwareSharedMaxAge('adsDetail', 120)).toBe(120);
    expect(edge.purgeAwareSharedMaxAge('adsList', undefined)).toBeUndefined();
    expect(edge.purgeAwareSharedMaxAge('staticDetail', 240)).toBe(240);
  });

  it('does not raise ads TTLs for a zone-only purge on a workers.dev Worker', () => {
    const edge = loadEdge(ENABLED);
    expect(edge.purgeAwareSharedMaxAge('adsDetail', 120)).toBe(120);
    expect(edge.purgeAwareSharedMaxAge('adsList', 120)).toBe(120);
    expect(edge.purgeAwareSharedMaxAge('staticDetail', 240)).toBe(240);
  });

  it('raises ads and static-detail TTLs only when the native Worker purge path is configured', () => {
    const edge = loadEdge(WORKER_CACHE_ENABLED);
    expect(edge.purgeAwareSharedMaxAge('adsDetail', 120)).toBe(3600);
    expect(edge.purgeAwareSharedMaxAge('adsList', 120)).toBe(600);
    expect(edge.purgeAwareSharedMaxAge('adsList', 9999)).toBe(9999);
    expect(edge.purgeAwareSharedMaxAge('staticDetail', 240)).toBe(600);
  });

  const header = (mw: (q: Request, r: Response, n: NextFunction) => void): string => {
    const setHeader = jest.fn();
    mw({ headers: {} } as Request, { setHeader } as unknown as Response, jest.fn());
    return setHeader.mock.calls.find(([k]) => k === 'Cache-Control')![1] as string;
  };

  const loadCache = (edgePurge: Record<string, unknown>) => {
    let CACHE!: typeof import('../../src/middlewares/cacheControl.middleware').CACHE;
    jest.isolateModules(() => {
      jest.doMock('../../src/config/env', () => ({ env: { edgePurge } }));
      jest.doMock('../../src/shared/utils/logger', () => ({
        logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
      }));
      CACHE = require('../../src/middlewares/cacheControl.middleware').CACHE;
    });
    return CACHE;
  };

  it('ADS_* presets are byte-identical to LIVE while purging is off; static details retain the previous shared TTL', () => {
    const CACHE = loadCache(DISABLED);
    expect(header(CACHE.ADS_LIST)).toBe(header(CACHE.LIVE));
    expect(header(CACHE.ADS_DETAIL)).toBe(header(CACHE.LIVE));
    expect(header(CACHE.STATIC_DETAIL)).toMatch(/max-age=120, s-maxage=240, stale-while-revalidate=600$/);
  });

  it('ADS_* presets lengthen ONLY s-maxage when purging is on; other routes are untouched', () => {
    const CACHE = loadCache(WORKER_CACHE_ENABLED);
    expect(header(CACHE.ADS_DETAIL)).toMatch(/max-age=30, s-maxage=3600, stale-while-revalidate=120$/);
    expect(header(CACHE.ADS_LIST)).toMatch(/max-age=30, s-maxage=600, stale-while-revalidate=120$/);
    expect(header(CACHE.STATIC_DETAIL)).toMatch(/max-age=120, s-maxage=600, stale-while-revalidate=600$/);
    expect(header(CACHE.LIVE)).not.toMatch(/s-maxage=(600|3600)/);
    expect(header(CACHE.MEDIUM)).not.toMatch(/s-maxage=3600/);
  });
});
