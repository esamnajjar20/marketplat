/**
 * Edge cache purge by Cache-Tag + purge-aware edge TTLs.
 *
 * The tag literals below are pinned identically in
 * workers/cf-api-proxy/cache-policy.test.mjs — if one side changes the tag
 * vocabulary, BOTH tests must change or purges silently stop matching.
 */
import type { Request, Response, NextFunction } from 'express';

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
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
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

  it('does not retry a permanent 4xx and never throws', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const edge = loadEdge(ENABLED);
    edge.purgeEdgeTags(['route:ads']);
    await expect(edge.flushEdgePurge()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
  });

  it('raises ads TTLs only when purging is on, never below the policy value', () => {
    const edge = loadEdge(ENABLED);
    expect(edge.purgeAwareSharedMaxAge('adsDetail', 120)).toBe(3600);
    expect(edge.purgeAwareSharedMaxAge('adsList', 120)).toBe(600);
    expect(edge.purgeAwareSharedMaxAge('adsList', 9999)).toBe(9999);
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

  it('ADS_* presets are byte-identical to LIVE while purging is off', () => {
    const CACHE = loadCache(DISABLED);
    expect(header(CACHE.ADS_LIST)).toBe(header(CACHE.LIVE));
    expect(header(CACHE.ADS_DETAIL)).toBe(header(CACHE.LIVE));
  });

  it('ADS_* presets lengthen ONLY s-maxage when purging is on; other routes are untouched', () => {
    const CACHE = loadCache(ENABLED);
    expect(header(CACHE.ADS_DETAIL)).toMatch(/max-age=30, s-maxage=3600, stale-while-revalidate=30$/);
    expect(header(CACHE.ADS_LIST)).toMatch(/max-age=30, s-maxage=600, stale-while-revalidate=30$/);
    expect(header(CACHE.LIVE)).not.toMatch(/s-maxage=(600|3600)/);
    expect(header(CACHE.MEDIUM)).not.toMatch(/s-maxage=3600/);
  });
});
