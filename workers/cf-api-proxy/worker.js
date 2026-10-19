/**
 * MarketPlat API Proxy Worker v4
 *
 * New in v4 (edge-cache round 2):
 * - #7  Cache-key normalization: params sorted, encoding unified (NFC + RFC3986),
 *       tracking params dropped, trailing slashes / %XX paths canonicalised, and the
 *       key host pinned to RENDER_ORIGIN (previously warm-up keys used a different
 *       host than request keys, so warmed entries were never hit).
 * - #12 Full stale-while-revalidate on the edge: an entry past s-maxage but inside
 *       the SWR window is served immediately and refreshed in the background
 *       (single-flight, ETag-aware). Stale-on-error still applies on top.
 * - #9  Negative caching: 404s of detail-like paths are cached for 60s.
 * - #10 Optional Workers KV tier (binding REFERENCE_KV) for near-static reference
 *       data (categories & co.): KV -> background refresh, ~0 origin queries.
 * - #8  Cache-Tag header on every stored response + POST /__purge__ (KV flush).
 *       Tag-based purging itself is done by the backend through the Cloudflare API.
 * - Fix: single-flight shared a Response whose body was already consumed.
 *
 * Keeps v3: ETag/304, stale-on-error, single-flight, metrics headers, /__warm__.
 */

const RENDER_ORIGIN = 'https://marketplat-nz19.onrender.com';

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
// Extra physical retention after ttl+swr so stale-on-error has something to serve.
const STALE_ERROR_GRACE_SEC = 600;

// Bumped v2 -> v3: key format changed (normalised query, pinned host, SWR metadata).
const CACHE_KEY_VERSION = 'v3';

// Negative caching (#9)
const NEGATIVE_TTL_SEC = 60;
const NEGATIVE_MAX_BODY = 4096;

// Workers KV tier (#10)
const REFERENCE_ROUTES = new Set([
  'categories',
  'product-categories',
  'service-categories',
  'service-types',
  'store-types',
]);
const KV_PREFIX = 'ref:v1:';
const KV_FRESH_SEC = 900; // serve from KV without touching the origin
const KV_STALE_SEC = 86400; // keep serving (and refresh in background) up to 24h
const KV_MAX_BODY = 1024 * 1024;
const KV_MAX_KEY = 400;

// Query params that never change the response: removed from key AND origin URL.
const IGNORED_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|msclkid|igshid|mc_cid|mc_eid|_ga|__mp_.*)$/i;

// Detail-path tag prefixes: /api/v1/ads/123 -> ad:123 (backend purges by these).
const DETAIL_TAG_PREFIX = {
  ads: 'ad',
  products: 'product',
  stores: 'store',
  'service-listings': 'service',
  'service-providers': 'provider',
};

// Cache-busting guard: a client can make every URL unique with junk params and
// turn the edge into a pass-through to Neon. Pathological shapes are served
// uncached (and counted as BYPASS-SHAPE) instead of polluting the cache.
const MAX_PARAMS = 16;
const MAX_KEY_LENGTH = 1024;

// Keep-warm only refreshes entries that have used more than this share of their ttl.
const WARM_REFRESH_AFTER = 0.5;

const inflight = new Map();

/* ───────────────────────── canonicalisation (#7) ───────────────────────── */

function canonicalizePath(pathname) {
  const segs = String(pathname)
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return seg;
      }
    });
  return '/' + segs.join('/');
}

function canonicalPairs(searchParams) {
  const pairs = [];
  for (const [rawKey, rawValue] of searchParams) {
    const key = rawKey.normalize('NFC').trim();
    if (!key || IGNORED_PARAM.test(key)) continue;
    pairs.push([key, rawValue.normalize('NFC').trim()]);
  }
  // Stable sort by key only: repeated keys keep their relative order.
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs;
}

function canonicalize(url) {
  const path = canonicalizePath(url.pathname);
  const pairs = canonicalPairs(url.searchParams);
  const search = pairs.length
    ? '?' + pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';
  const segs = path.split('/').filter(Boolean); // ['api','v1','ads', ...]
  return {
    path,
    search,
    key: path + search,
    route: segs[2] || '',
    rest: segs.slice(3),
    pairs,
  };
}

// Cache API keys are versioned and pinned to one host so entries written by older
// Worker releases, by /__warm__ and by real requests all land on the same key.
function makeCacheKey(input) {
  const canon = input && typeof input.key === 'string' ? input : canonicalize(input);
  const sep = canon.search ? '&' : '?';
  return new Request(`${RENDER_ORIGIN}${canon.key}${sep}__mp_cache_policy=${CACHE_KEY_VERSION}`, {
    method: 'GET',
  });
}

/* ───────────────────────── cache tags (#8) ───────────────────────── */

// MUST stay identical to backend/src/shared/cache/edgePurge.ts (see parity tests).
function cityTagValue(city) {
  return encodeURIComponent(
    String(city).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ /g, '-'),
  );
}

function edgeTagsFor(canon) {
  const tags = ['api'];
  if (canon.route) tags.push(`route:${canon.route}`);
  const detailPrefix = DETAIL_TAG_PREFIX[canon.route];
  if (detailPrefix && canon.rest.length >= 1) tags.push(`${detailPrefix}:${canon.rest[0]}`);
  const cityPair = canon.pairs.find(([k]) => k === 'city');
  tags.push(cityPair && cityPair[1] ? `city:${cityTagValue(cityPair[1])}` : 'city:any');
  return tags.join(',');
}

/* ───────────────────────── upstream policy ───────────────────────── */

function isUpstreamCacheable(response) {
  if (!response || response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  // Vary: * can never be matched. Vary: Authorization / Cookie is allowed: the
  // origin's public routes (CACHE.STATIC/SHORT/MEDIUM/LIVE) always declare it on
  // anonymous responses, and this Worker only reaches this check for requests
  // that carry NO Authorization header and NO Cookie (see the `hasAuth` gate in
  // fetch() and the header-less warm-up). Rejecting it made every
  // cacheControl() route BYPASS-POLICY, so the edge only ever cached /home.
  const vary = (response.headers.get('vary') || '').toLowerCase();
  if (vary.split(',').some((token) => token.trim() === '*')) return false;
  const cc = (response.headers.get('cache-control') || '').toLowerCase();
  const directives = cc.split(',').map((part) => part.trim().split('=')[0]);
  if (['private', 'no-store', 'no-cache'].some((directive) => directives.includes(directive))) return false;
  // The API Worker is a shared cache: require an explicit public policy from
  // the origin rather than converting private/default responses into public.
  return directives.includes('public') || /(?:^|,)\s*s-maxage=\d+/.test(cc);
}

function parseCacheControl(cc) {
  const sm = cc.match(/s-maxage=(\d+)/);
  const mx = cc.match(/(?:^|[,\s])max-age=(\d+)/);
  const sw = cc.match(/stale-while-revalidate=(\d+)/);
  return {
    ttl: sm ? parseInt(sm[1], 10) : mx ? parseInt(mx[1], 10) : DEFAULT_TTL,
    swr: sw ? parseInt(sw[1], 10) : DEFAULT_SWR,
    browserMaxAge: mx ? parseInt(mx[1], 10) : 0,
  };
}

// Browser keeps the origin's own max-age; the edge adds s-maxage + SWR.
function clientCacheControl(browserMaxAge, ttl, swr) {
  return `public, max-age=${browserMaxAge}, s-maxage=${ttl}, stale-while-revalidate=${swr}`;
}

function inmMatches(clientINM, etag) {
  if (!clientINM || !etag) return false;
  const strip = (v) => v.trim().replace(/^W\//, '');
  const want = strip(etag);
  return clientINM.split(',').some((candidate) => {
    const c = strip(candidate);
    return c === '*' || c === want;
  });
}

/* ───────────────────────── stored entries (Cache API) ───────────────────────── */

function buildStored(body, o) {
  const h = new Headers();
  h.set('content-type', o.contentType || 'application/json');
  h.set('cache-control', `public, max-age=${o.ttl + o.swr + STALE_ERROR_GRACE_SEC}`);
  h.set('x-mp-stored-at', String(o.storedAt));
  h.set('x-mp-ttl', String(o.ttl));
  h.set('x-mp-swr', String(o.swr));
  h.set('x-mp-client-cc', o.clientCc);
  if (o.neg) h.set('x-mp-neg', '1');
  if (o.etag) h.set('etag', o.etag);
  if (o.vary) h.set('vary', o.vary);
  if (o.tags) h.set('cache-tag', o.tags);
  return new Response(body, { status: 200, headers: h });
}

function storedInfo(stored) {
  const h = stored.headers;
  const storedAt = Number(h.get('x-mp-stored-at')) || 0;
  return {
    storedAt,
    ttl: Number(h.get('x-mp-ttl')) || 0,
    swr: Number(h.get('x-mp-swr')) || 0,
    age: Math.max(0, (Date.now() - storedAt) / 1000),
    neg: h.get('x-mp-neg') === '1',
  };
}

function publicHeaders(o) {
  const h = new Headers();
  h.set('content-type', o.contentType || 'application/json');
  h.set('cache-control', o.clientCc);
  if (o.etag) h.set('etag', o.etag);
  if (o.vary) h.set('vary', o.vary);
  if (o.tags) h.set('cache-tag', o.tags);
  if (typeof o.age === 'number') h.set('age', String(Math.floor(o.age)));
  h.set('x-proxy-cache', o.cacheStatus);
  h.set('x-upstream-ms', String(o.ms || 0));
  if (o.ttl) h.set('x-cache-ttl', String(o.ttl));
  h.set('access-control-allow-origin', '*');
  return h;
}

// Entry (stored Response) -> descriptor that is safe to hand to many waiters.
async function storedToDesc(stored, cacheStatus, ms) {
  const info = storedInfo(stored);
  const body = await stored.arrayBuffer();
  return {
    status: info.neg ? 404 : 200,
    body,
    cacheable: !info.neg,
    etag: stored.headers.get('etag'),
    headers: publicHeaders({
      contentType: stored.headers.get('content-type'),
      clientCc: stored.headers.get('x-mp-client-cc') || clientCacheControl(0, info.ttl, info.swr),
      etag: stored.headers.get('etag'),
      vary: stored.headers.get('vary'),
      tags: stored.headers.get('cache-tag'),
      age: info.age,
      cacheStatus,
      ms,
      ttl: info.ttl,
    }),
  };
}

function descToResponse(desc, clientINM) {
  if (desc.cacheable && desc.status === 200 && inmMatches(clientINM, desc.etag)) {
    const h = new Headers();
    for (const k of ['etag', 'cache-control', 'vary', 'cache-tag']) {
      const v = desc.headers.get(k);
      if (v) h.set(k, v);
    }
    h.set('x-proxy-cache', `${desc.headers.get('x-proxy-cache')}-304`);
    h.set('x-upstream-ms', '0');
    h.set('access-control-allow-origin', '*');
    return new Response(null, { status: 304, headers: h });
  }
  return new Response(desc.body, { status: desc.status, headers: new Headers(desc.headers) });
}

/* ───────────────────────── origin ───────────────────────── */

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
  if (!request) return new Headers({ 'accept-encoding': 'gzip, br' });
  const h = new Headers(request.headers);
  h.set('host', new URL(RENDER_ORIGIN).host);
  for (const x of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-forwarded-for']) {
    h.delete(x);
  }
  if (!h.has('accept-encoding')) h.set('accept-encoding', 'gzip, br');
  if (extra) for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

function passthroughDesc(upstream, body, cacheStatus, ms) {
  const h = new Headers(upstream.headers);
  h.set('x-proxy-cache', cacheStatus);
  h.set('x-upstream-ms', String(ms || 0));
  h.set('access-control-allow-origin', '*');
  return { status: upstream.status, body, cacheable: false, etag: null, headers: h };
}

function isNegativeEligible(canon, upstream, body) {
  if (upstream.status !== 404) return false;
  if (canon.rest.length < 1) return false; // only detail-like paths (/ads/:id)
  if (upstream.headers.has('set-cookie')) return false;
  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('json')) return false;
  return body.byteLength <= NEGATIVE_MAX_BODY;
}

/* ───────────────────────── Workers KV tier (#10) ───────────────────────── */

function kvEnabled(env, canon) {
  return Boolean(
    env && env.REFERENCE_KV && REFERENCE_ROUTES.has(canon.route) && canon.key.length <= KV_MAX_KEY,
  );
}

async function kvRead(env, canon) {
  if (!kvEnabled(env, canon)) return null;
  try {
    const { value, metadata } = await env.REFERENCE_KV.getWithMetadata(KV_PREFIX + canon.key, 'arrayBuffer');
    if (!value || !metadata || !metadata.storedAt) return null;
    return { body: value, meta: metadata, age: Math.max(0, (Date.now() - metadata.storedAt) / 1000) };
  } catch {
    return null;
  }
}

async function kvWrite(env, canon, body, meta) {
  if (!kvEnabled(env, canon) || body.byteLength > KV_MAX_BODY) return;
  try {
    await env.REFERENCE_KV.put(KV_PREFIX + canon.key, body, {
      expirationTtl: KV_STALE_SEC + KV_FRESH_SEC,
      metadata: meta,
    });
  } catch {
    /* KV is an optimisation: never fail a request because of it */
  }
}

async function kvPurgeAll(env) {
  if (!env || !env.REFERENCE_KV) return 0;
  let deleted = 0;
  let cursor;
  do {
    const page = await env.REFERENCE_KV.list({ prefix: KV_PREFIX, cursor });
    for (const k of page.keys) {
      await env.REFERENCE_KV.delete(k.name);
      deleted += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

function timingSafeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/* ───────────────────────── load from origin + store ───────────────────────── */

/**
 * Turns an origin response into a shareable descriptor and (when allowed) stores
 * it in the Cache API, plus KV for reference routes. Returns a descriptor, never a
 * live Response, so the single-flight promise can be shared by any number of
 * waiters.
 */
async function processUpstream(upstream, ms, { canon, cache, cacheKey, ctx, env, awaitStore }) {
  // Network error / 5xx -> stale-on-error
  if (!upstream || upstream.status >= 500) {
    if (STALE_ON_ERROR) {
      const stale = await cache.match(cacheKey);
      if (stale) return storedToDesc(stale, 'STALE-ERROR', ms);
    }
    if (!upstream) {
      return {
        status: 502,
        body: 'Upstream error',
        cacheable: false,
        etag: null,
        headers: new Headers({ 'x-proxy-cache': 'BYPASS-ERROR', 'access-control-allow-origin': '*' }),
      };
    }
    return passthroughDesc(upstream, await upstream.arrayBuffer(), 'BYPASS-ERROR', ms);
  }

  const body = await upstream.arrayBuffer();
  const tags = edgeTagsFor(canon);
  const store = (entry) => {
    const p = cache.put(cacheKey, entry);
    if (awaitStore) return p;
    if (ctx) ctx.waitUntil(p);
    return undefined;
  };

  // Negative caching (#9)
  if (isNegativeEligible(canon, upstream, body)) {
    const clientCc = clientCacheControl(0, NEGATIVE_TTL_SEC, 0);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    await store(
      buildStored(body, {
        contentType,
        ttl: NEGATIVE_TTL_SEC,
        swr: 0,
        clientCc,
        storedAt: Date.now(),
        neg: true,
        tags,
      }),
    );
    return {
      status: 404,
      body,
      cacheable: false,
      etag: null,
      headers: publicHeaders({ contentType, clientCc, tags, cacheStatus: 'NEG-MISS', ms, ttl: NEGATIVE_TTL_SEC }),
    };
  }

  if (upstream.status !== 200) return passthroughDesc(upstream, body, 'BYPASS-NON200', ms);

  // Never override private/no-store/no-cache or Set-Cookie responses with a public
  // Cache-Control header. Protects routes such as /home/feed and /recommendations.
  const { ttl, swr, browserMaxAge } = parseCacheControl(upstream.headers.get('cache-control') || '');
  if (!isUpstreamCacheable({ status: upstream.status, headers: upstream.headers }) || ttl <= 0) {
    return passthroughDesc(upstream, body, 'BYPASS-POLICY', ms);
  }

  const contentType = upstream.headers.get('content-type') || 'application/json';
  const etag = upstream.headers.get('etag');
  const vary = upstream.headers.get('vary');
  const clientCc = clientCacheControl(browserMaxAge, ttl, swr);
  const storedAt = Date.now();

  if (body.byteLength <= MAX_CACHE_SIZE) {
    await store(buildStored(body, { contentType, etag, vary, tags, ttl, swr, clientCc, storedAt }));
    if (kvEnabled(env, canon)) {
      const kvTask = kvWrite(env, canon, body, { ct: contentType, etag, vary, ttl, swr, bcc: browserMaxAge, storedAt });
      if (awaitStore) await kvTask;
      else if (ctx) ctx.waitUntil(kvTask);
    }
  }

  return {
    status: 200,
    body,
    cacheable: true,
    etag,
    headers: publicHeaders({ contentType, clientCc, etag, vary, tags, cacheStatus: 'MISS', ms, ttl }),
  };
}

async function originLoad(args) {
  const headers = cleanUpstreamHeaders(args.request, null);
  // Never forward client validators: we always want a full 200 we can store.
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const { res, ms } = await fetchUpstream(RENDER_ORIGIN + args.canon.key, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });
  return processUpstream(res, ms, args);
}

// Background revalidation with the stored ETag. A 304 keeps the body and restarts
// the clock; anything else goes through the normal path (policy / negative / error).
async function revalidateLoad(args) {
  const { canon, request, cache, cacheKey, stale } = args;
  const etag = stale.headers.get('etag');
  if (!etag) return originLoad(args);

  const headers = cleanUpstreamHeaders(request, null);
  headers.delete('if-modified-since');
  headers.set('if-none-match', etag);
  const { res: upstream, ms } = await fetchUpstream(RENDER_ORIGIN + canon.key, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  if (upstream && upstream.status === 304) {
    const info = storedInfo(stale);
    const body = await stale.arrayBuffer();
    await cache.put(
      cacheKey,
      buildStored(body, {
        contentType: stale.headers.get('content-type'),
        etag,
        vary: stale.headers.get('vary'),
        tags: stale.headers.get('cache-tag'),
        ttl: info.ttl,
        swr: info.swr,
        clientCc: stale.headers.get('x-mp-client-cc') || clientCacheControl(0, info.ttl, info.swr),
        storedAt: Date.now(),
      }),
    );
    return null;
  }
  return processUpstream(upstream, ms, args);
}

function startLoad(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = factory().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/* ───────────────────────── request handling ───────────────────────── */

async function handleCacheable(request, canon, ctx, env) {
  const cache = caches.default;
  const cacheKey = makeCacheKey(canon);
  const clientINM = request.headers.get('if-none-match');
  const flightKey = canon.key;
  const loadArgs = { canon, request, cache, cacheKey, ctx, env };

  // 1. Edge cache
  const cached = await cache.match(cacheKey);
  if (cached) {
    const info = storedInfo(cached);
    if (info.age <= info.ttl) {
      return descToResponse(await storedToDesc(cached, info.neg ? 'HIT-NEGATIVE' : 'HIT', 0), clientINM);
    }
    // 1b. #12 stale-while-revalidate: answer now, refresh in the background.
    if (!info.neg && info.age <= info.ttl + info.swr) {
      const desc = await storedToDesc(cached.clone(), 'STALE', 0);
      ctx.waitUntil(
        startLoad(`rv:${flightKey}`, () => revalidateLoad({ ...loadArgs, stale: cached })).catch(() => {}),
      );
      return descToResponse(desc, clientINM);
    }
  }

  // 2. #10 KV tier for reference data
  const kv = await kvRead(env, canon);
  if (kv) {
    const m = kv.meta;
    const clientCc = clientCacheControl(m.bcc || 0, m.ttl, m.swr);
    const kvDesc = {
      status: 200,
      body: kv.body,
      cacheable: true,
      etag: m.etag || null,
      headers: publicHeaders({
        contentType: m.ct,
        clientCc,
        etag: m.etag,
        vary: m.vary,
        tags: edgeTagsFor(canon),
        age: kv.age,
        cacheStatus: kv.age <= KV_FRESH_SEC ? 'KV-HIT' : 'KV-STALE',
        ms: 0,
        ttl: m.ttl,
      }),
    };
    if (kv.age <= KV_STALE_SEC) {
      ctx.waitUntil(
        cache.put(
          cacheKey,
          buildStored(kv.body, {
            contentType: m.ct,
            etag: m.etag,
            vary: m.vary,
            tags: edgeTagsFor(canon),
            ttl: m.ttl,
            swr: m.swr,
            clientCc,
            storedAt: Date.now(),
          }),
        ),
      );
      if (kv.age > KV_FRESH_SEC) {
        ctx.waitUntil(startLoad(`rv:${flightKey}`, () => originLoad(loadArgs)).catch(() => {}));
      }
      return descToResponse(kvDesc, clientINM);
    }
  }

  // 3. Miss -> single-flight origin load (descriptor is shareable, Response is not)
  const shared = inflight.has(flightKey);
  try {
    const desc = await startLoad(flightKey, () => originLoad(loadArgs));
    if (shared && desc.headers.get('x-proxy-cache') === 'MISS') {
      const h = new Headers(desc.headers);
      h.set('x-proxy-cache', 'SHARED');
      return descToResponse({ ...desc, headers: h }, clientINM);
    }
    return descToResponse(desc, clientINM);
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 502 });
  }
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
  '/api/v1/home/static',
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

async function warmCache(env, ctx) {
  const cache = caches.default;
  const results = [];
  for (const path of WARM_PATHS) {
    const canon = canonicalize(new URL(RENDER_ORIGIN + path));
    const cacheKey = makeCacheKey(canon);
    try {
      // Don't hit the origin (Neon) for entries that are still young: the warm-up
      // only exists to renew entries before they expire.
      const existing = await cache.match(cacheKey);
      if (existing) {
        const info = storedInfo(existing);
        if (!info.neg && info.age <= info.ttl * WARM_REFRESH_AFTER) {
          results.push({ path, status: 'FRESH', age: Math.floor(info.age) });
          continue;
        }
      }
      const desc = await originLoad({ canon, request: null, cache, cacheKey, ctx, env, awaitStore: true });
      const status = desc.headers.get('x-proxy-cache');
      if (status === 'MISS') {
        results.push({ path, status: 'WARMED', ttl: Number(desc.headers.get('x-cache-ttl')) || null });
      } else {
        results.push({
          path,
          status: desc.status === 200 || status === 'BYPASS-POLICY' ? 'SKIP_POLICY' : 'FAIL',
          code: desc.status,
          cacheControl: desc.headers.get('cache-control') || null,
        });
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

/**
 * Optional measurement (Workers Analytics Engine, binding CACHE_METRICS).
 * One data point per cacheable request: blobs=[cache status, route, colo],
 * doubles=[upstream ms, http status]. No binding => no-op. Never throws.
 * Query it with the SQL in EDGE_CACHE_ROUND3_REPORT.md to get the REAL hit ratio.
 */
function recordMetric(env, ctx, canon, response, request) {
  try {
    if (!env || !env.CACHE_METRICS) return;
    const colo = (request.cf && request.cf.colo) || 'unknown';
    env.CACHE_METRICS.writeDataPoint({
      blobs: [response.headers.get('x-proxy-cache') || 'NONE', canon.route || 'root', String(colo)],
      doubles: [Number(response.headers.get('x-upstream-ms')) || 0, response.status],
      indexes: [canon.route || 'root'],
    });
  } catch {
    /* metrics must never affect a response */
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/__warm__') {
      // When PURGE_TOKEN is configured the manual trigger needs it (the cron does not).
      const secret = env && env.PURGE_TOKEN;
      if (secret && !timingSafeEqual(request.headers.get('x-purge-token'), secret)) {
        return new Response('Forbidden', { status: 403 });
      }
      const results = await warmCache(env, ctx);
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Backend-triggered flush of the KV reference tier (#10). Cache API entries of
    // reference routes expire on their own within minutes; KV would otherwise keep
    // serving a changed category list for up to KV_FRESH_SEC.
    if (url.pathname === '/__purge__') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const secret = env && env.PURGE_TOKEN;
      if (!secret || !timingSafeEqual(request.headers.get('x-purge-token'), secret)) {
        return new Response('Forbidden', { status: 403 });
      }
      const deleted = await kvPurgeAll(env);
      return new Response(JSON.stringify({ ok: true, deleted }), {
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
    const canon = canonicalize(url);
    const deliberatelyPrivatePath =
      canon.path === '/api/v1/home/feed' ||
      canon.path === '/api/v1/home/for-you' ||
      canon.path === '/api/v1/recommendations' ||
      canon.path.startsWith('/api/v1/recommendations/');
    const isCacheable =
      isGet &&
      !hasAuth &&
      !deliberatelyPrivatePath &&
      CACHEABLE_PREFIXES.some((p) => canon.path === p || canon.path.startsWith(`${p}/`));

    if (isCacheable) {
      if (canon.pairs.length > MAX_PARAMS || canon.key.length > MAX_KEY_LENGTH) {
        const res = await handlePassthrough(request, url);
        res.headers.set('x-proxy-cache', 'BYPASS-SHAPE');
        recordMetric(env, ctx, canon, res, request);
        return res;
      }
      const res = await handleCacheable(request, canon, ctx, env);
      recordMetric(env, ctx, canon, res, request);
      return res;
    }
    return handlePassthrough(request, url);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(warmCache(env, ctx));
  },
};
