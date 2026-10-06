/**
 * MarketPlat API Proxy Worker v3
 *
 * New in v3:
 * - ETag support: forward + cache + 304 Not Modified
 * - Keeps v2 features (respects Cache-Control, stale-on-error,
 *   single-flight, metrics headers, /__warm__ endpoint)
 */

const RENDER_ORIGIN = 'https://marketplat.onrender.com';

const CACHEABLE_PREFIXES = [
  '/api/v1/home',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/service-types',
  '/api/v1/store-types',
  '/api/v1/ads',
  '/api/v1/products',
  '/api/v1/stores',
  '/api/v1/service-listings',
  '/api/v1/service-providers',
  '/api/v1/sellers/ranking',
  '/api/v1/recommendations',
  '/api/v1/search',
  '/api/v1/requests',
];

const DEFAULT_TTL = 300;
const DEFAULT_SWR = 900;
const MAX_CACHE_SIZE = 10 * 1024 * 1024;
const STALE_ON_ERROR = true;

const inflight = new Map();

function parseCacheControl(cc) {
  const sm = cc.match(/s-maxage=(\d+)/);
  const mx = cc.match(/(?:^|[,\s])max-age=(\d+)/);
  const sw = cc.match(/stale-while-revalidate=(\d+)/);
  return {
    ttl: sm ? parseInt(sm[1], 10) : mx ? parseInt(mx[1], 10) : DEFAULT_TTL,
    swr: sw ? parseInt(sw[1], 10) : DEFAULT_SWR,
  };
}

function withMeta(resp, cacheStatus, upstreamMs, ttl) {
  const h = new Headers(resp.headers);
  h.set('x-proxy-cache', cacheStatus);
  h.set('x-upstream-ms', String(upstreamMs || 0));
  if (ttl) h.set('x-cache-ttl', String(ttl));
  h.set('access-control-allow-origin', '*');
  return new Response(resp.body, { status: resp.status, headers: h });
}

function build304Response(cached, cacheStatus) {
  const h = new Headers();
  const etag = cached.headers.get('etag');
  const cc = cached.headers.get('cache-control');
  const vary = cached.headers.get('vary');
  if (etag) h.set('etag', etag);
  if (cc) h.set('cache-control', cc);
  if (vary) h.set('vary', vary);
  h.set('x-proxy-cache', cacheStatus);
  h.set('x-upstream-ms', '0');
  h.set('access-control-allow-origin', '*');
  return new Response(null, { status: 304, headers: h });
}

async function fetchUpstream(url, init) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, init);
    return { res, ms: Date.now() - t0 };
  } catch (e) {
    return { res: null, ms: Date.now() - t0, error: e.message };
  }
}

function cleanUpstreamHeaders(request, extra) {
  const h = new Headers(request.headers);
  h.set('host', new URL(RENDER_ORIGIN).host);
  for (const x of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-forwarded-for']) {
    h.delete(x);
  }
  if (!h.has('accept-encoding')) h.set('accept-encoding', 'gzip, br');
  if (extra) for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

async function handleCacheable(request, url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const key = url.toString();
  const clientIfNoneMatch = request.headers.get('if-none-match');

  // 1. Cache HIT
  const cached = await cache.match(cacheKey);
  if (cached) {
    const cachedETag = cached.headers.get('etag');
    // ETag match → 304
    if (clientIfNoneMatch && cachedETag && clientIfNoneMatch === cachedETag) {
      return build304Response(cached, 'HIT-304');
    }
    return withMeta(cached, 'HIT', 0, null);
  }

  // 2. Single-flight
  if (inflight.has(key)) {
    try {
      const shared = await inflight.get(key);
      if (shared) {
        const sETag = shared.headers.get('etag');
        if (clientIfNoneMatch && sETag && clientIfNoneMatch === sETag) {
          return build304Response(shared, 'SHARED-304');
        }
        return withMeta(shared, 'SHARED', 0, null);
      }
    } catch {}
  }

  // 3. Build
  const targetUrl = new URL(url.pathname + url.search, RENDER_ORIGIN);
  // Forward If-None-Match to origin so a 304 can come back quickly
  const headers = cleanUpstreamHeaders(request,
    clientIfNoneMatch ? { 'if-none-match': clientIfNoneMatch } : null);

  const promise = (async () => {
    const { res: upstream, ms } = await fetchUpstream(targetUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
    });

    // 4. Upstream 304 → serve our cached body (or fall through if none)
    if (upstream && upstream.status === 304) {
      const stale = await cache.match(cacheKey);
      if (stale) return withMeta(stale, 'REVALIDATED', ms, null);
      // No cache but origin says not-modified → rebuild without INM
      const fresh = await fetchUpstream(targetUrl.toString(), {
        method: 'GET',
        headers: cleanUpstreamHeaders(request),
        redirect: 'manual',
      });
      if (!fresh.res || fresh.res.status !== 200) {
        return new Response('Revalidation failed', { status: 502 });
      }
      return await finalize(fresh.res, fresh.ms, cacheKey, cache, ctx);
    }

    // 5. Upstream 5xx / network error → stale fallback
    if (!upstream || upstream.status >= 500) {
      if (STALE_ON_ERROR) {
        const stale = await cache.match(cacheKey);
        if (stale) {
          const h = new Headers(stale.headers);
          h.set('x-proxy-cache', 'STALE-ERROR');
          h.set('x-upstream-ms', String(ms));
          h.set('access-control-allow-origin', '*');
          return new Response(stale.body, { status: 200, headers: h });
        }
      }
      if (!upstream) return new Response('Upstream error', { status: 502 });
      const h = new Headers(upstream.headers);
      h.set('x-proxy-cache', 'BYPASS-ERROR');
      h.set('x-upstream-ms', String(ms));
      h.set('access-control-allow-origin', '*');
      return new Response(upstream.body, { status: upstream.status, headers: h });
    }

    // 6. Non-200 → pass through
    if (upstream.status !== 200) {
      const h = new Headers(upstream.headers);
      h.set('x-proxy-cache', 'BYPASS-NON200');
      h.set('x-upstream-ms', String(ms));
      h.set('access-control-allow-origin', '*');
      return new Response(upstream.body, { status: upstream.status, headers: h });
    }

    // 7. 200 → finalize
    return await finalize(upstream, ms, cacheKey, cache, ctx);
  })();

  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));

  try {
    return await promise;
  } catch (e) {
    inflight.delete(key);
    return new Response(`Proxy error: ${e.message}`, { status: 502 });
  }
}

async function finalize(upstream, ms, cacheKey, cache, ctx) {
  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') || 'application/json';
  const { ttl, swr } = parseCacheControl(upstream.headers.get('cache-control') || '');
  const etag = upstream.headers.get('etag');
  const vary = upstream.headers.get('vary');

  const cacheHeaders = {
    'content-type': contentType,
    'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`,
  };
  if (etag) cacheHeaders['etag'] = etag;
  if (vary) cacheHeaders['vary'] = vary;

  if (body.byteLength <= MAX_CACHE_SIZE) {
    const toCache = new Response(body, { status: 200, headers: cacheHeaders });
    ctx.waitUntil(cache.put(cacheKey, toCache.clone()));
  }

  return new Response(body, {
    status: 200,
    headers: {
      ...cacheHeaders,
      'x-proxy-cache': 'MISS',
      'x-cache-ttl': String(ttl),
      'x-upstream-ms': String(ms),
      'access-control-allow-origin': '*',
    },
  });
}

async function handlePassthrough(request, url) {
  const targetUrl = new URL(url.pathname + url.search, RENDER_ORIGIN);
  const headers = cleanUpstreamHeaders(request);
  const init = { method: request.method, headers, redirect: 'manual' };
  const isGet = request.method === 'GET' || request.method === 'HEAD';
  if (!isGet) init.body = request.body;

  const { res: upstream } = await fetchUpstream(targetUrl.toString(), init);
  if (!upstream) return new Response('Upstream error', { status: 502 });

  const h = new Headers(upstream.headers);
  h.set('x-proxy-cache', 'BYPASS');
  h.set('access-control-allow-origin', request.headers.get('origin') || '*');
  h.set('access-control-allow-credentials', 'true');
  h.delete('cf-cache-status');
  return new Response(upstream.body, { status: upstream.status, headers: h });
}

const WARM_PATHS = [
  '/api/v1/home',
  '/api/v1/categories',
  '/api/v1/product-categories',
  '/api/v1/service-categories',
  '/api/v1/service-types',
  '/api/v1/store-types',
  '/api/v1/ads?limit=10',
  '/api/v1/products?limit=10',
  '/api/v1/stores?limit=10',
  '/api/v1/service-listings?limit=10',
  '/api/v1/service-providers?limit=10',
  '/api/v1/sellers/ranking',
];

async function warmCache() {
  const cache = caches.default;
  const results = [];
  for (const path of WARM_PATHS) {
    const url = new URL(RENDER_ORIGIN + path);
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    try {
      const res = await fetch(url.toString(), { headers: { 'accept-encoding': 'gzip, br' } });
      if (res.status === 200) {
        const body = await res.arrayBuffer();
        const { ttl, swr } = parseCacheControl(res.headers.get('cache-control') || '');
        const headers = {
          'content-type': res.headers.get('content-type') || 'application/json',
          'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`,
        };
        const etag = res.headers.get('etag');
        if (etag) headers['etag'] = etag;
        await cache.put(cacheKey, new Response(body, { status: 200, headers }));
        results.push({ path, status: 'WARMED', ttl });
      } else {
        results.push({ path, status: 'FAIL', code: res.status });
      }
    } catch (e) {
      results.push({ path, status: 'ERROR', msg: e.message });
    }
  }
  console.log('[warm]', JSON.stringify(results));
  return results;
}

function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.get('origin') || '*',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Offline-Op-Id, If-None-Match',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '86400',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/__warm__') {
      const results = await warmCache();
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const isGet = request.method === 'GET' || request.method === 'HEAD';
    const hasAuth = request.headers.has('authorization') || request.headers.has('cookie');
    const isCacheable = isGet && !hasAuth &&
      CACHEABLE_PREFIXES.some((p) => url.pathname.startsWith(p));

    if (isCacheable) return handleCacheable(request, url, ctx);
    return handlePassthrough(request, url);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(warmCache());
  },
};
