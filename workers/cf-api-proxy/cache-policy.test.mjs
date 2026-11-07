import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
  .replace('export class GatewayHealthCoordinator', 'class GatewayHealthCoordinator')
  .replace('export default {', 'globalThis.__worker = {');

const ORIGIN = 'https://marketplat-nz19.onrender.com';
const EDGE = 'https://marketplat-api.esamnajjar6.workers.dev';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeHealthNamespace(Coordinator) {
  const store = new Map();
  let transactionTail = Promise.resolve();
  const storage = {
    get: async (key) => cloneJson(store.get(key)),
    transaction: (callback) => {
      const run = transactionTail.then(() => callback({
        get: async (key) => cloneJson(store.get(key)),
        put: async (key, value) => { store.set(key, cloneJson(value)); },
        delete: async (key) => store.delete(key),
      }));
      transactionTail = run.catch(() => {});
      return run;
    },
  };
  const coordinator = new Coordinator({ storage });
  const stub = {
    fetch: async (input, init) => coordinator.fetch(new Request(input, init)),
  };
  return {
    idFromName: (name) => ({ name }),
    get: () => stub,
    store,
    coordinator,
  };
}

/** Fresh isolate per scenario: fake Cache API, fake KV, scripted origin. */
function harness({ upstream, kv, cacheFailure = false, nativeCacheUnavailable = false, nativeCacheFailure = false, envOverrides = {} } = {}) {
  const store = new Map();
  const cacheCalls = [];
  const cache = {
    match: async (key) => {
      cacheCalls.push(['match', key.url]);
      if (cacheFailure === 'match' || cacheFailure === true) throw new Error('Cache API match unavailable');
      const hit = store.get(key.url);
      if (!hit) return undefined;
      // Cloudflare Cache API strips Cache-Tag from cache.match(); retain normal
      // custom headers exactly as the real runtime does.
      const headers = new Headers(hit.headers);
      headers.delete('cache-tag');
      return new Response(await hit.clone().arrayBuffer(), { status: hit.status, headers });
    },
    put: async (key, res) => {
      cacheCalls.push(['put', key.url]);
      if (cacheFailure === 'put' || cacheFailure === true) throw new Error('Cache API put unavailable');
      store.set(key.url, res.clone());
    },
  };
  const upstreamLog = [];
  const nativeCachePurges = [];
  const context = {
    URL, Request, Response, Headers, Map, Set, Date, Math, String, Number, JSON, Promise, RegExp, Object, Array, AbortSignal,
    encodeURIComponent, decodeURIComponent,
    console: { log() {}, error() {} },
    caches: { default: cache },
    fetch: async (url, init = {}) => {
      const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
      upstreamLog.push({ url: String(url), headers, init });
      return upstream(String(url), headers, upstreamLog.length, init);
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.__internals = { isUpstreamCacheable, makeCacheKey, edgeTagsFor, canonicalize, kvEnabled, kvTtlPolicy, searchCacheAllowed, isValidIpAddress, getRenderOrigin, validateGatewayRegistry, validateBackendOrigin, validateGatewayPath, normalizeGatewayRequestTarget, weightedPriorityOrder, backendCandidates, goAdaptiveWeightMap, loadGatewayRegistry, recordBackendResult, fetchBackend, GatewayHealthCoordinator, exportGatewayHealthHistory, pruneGatewayHealthHistory, D1FeatureFlagStore };`, context);
  const pending = [];
  const ctx = {
    waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})),
    ...(nativeCacheUnavailable ? {} : { cache: { purge: async (options) => {
      nativeCachePurges.push(cloneJson(options));
      if (nativeCacheFailure) throw new Error('Workers Cache purge unavailable');
    } } }),
  };
  const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
  const env = { ...(kv ? { REFERENCE_KV: kv } : {}), PURGE_TOKEN: 's3cret', ...envOverrides };
  const call = (path, init) => context.__worker.fetch(new Request(`${EDGE}${path}`, init), env, ctx);
  const callAt = (host, path, init) => context.__worker.fetch(new Request(`https://${host}${path}`, init), env, ctx);
  // Age a stored entry by `seconds` (rewrites x-mp-stored-at).
  const ageEntry = async (matcher, seconds) => {
    for (const [k, v] of store) {
      if (!matcher(k)) continue;
      const h = new Headers(v.headers);
      h.set('x-mp-stored-at', String(Number(h.get('x-mp-stored-at')) - seconds * 1000));
      store.set(k, new Response(await v.clone().arrayBuffer(), { status: 200, headers: h }));
    }
  };
  return { context, call, callAt, store, cacheCalls, upstreamLog, nativeCachePurges, settle, ageEntry, internals: context.__internals };
}

const json = (body, headers = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const PUBLIC_LIVE = {
  'cache-control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=30',
  vary: 'Authorization',
  etag: '"v1"',
};

/* ───────────── client IP validation and spoofed-header stripping ───────────── */
{
  const { internals, call, upstreamLog } = harness({ upstream: async () => json({ ok: true }) });
  for (const valid of ['203.0.113.7', '2001:db8::1', '::ffff:192.0.2.1']) {
    assert.equal(internals.isValidIpAddress(valid), true, `${valid} should be a valid IP`);
  }
  for (const invalid of ['999.1.1.1', '1.2.3', '1::2::3', 'gggg::1', ' 203.0.113.7']) {
    assert.equal(internals.isValidIpAddress(invalid), false, `${invalid} should be rejected`);
  }

  await call('/api/v1/home/feed', {
    headers: {
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.42',
      'x-real-ip': '198.51.100.42',
    },
  });
  assert.equal(upstreamLog[0].headers.get('x-forwarded-for'), '203.0.113.7');
  assert.equal(upstreamLog[0].headers.get('x-real-ip'), '203.0.113.7');

  await call('/api/v1/home/feed', {
    headers: {
      'cf-connecting-ip': '999.1.1.1',
      'x-forwarded-for': '198.51.100.42',
      'x-real-ip': '198.51.100.42',
    },
  });
  assert.equal(upstreamLog[1].headers.get('x-forwarded-for'), null);
  assert.equal(upstreamLog[1].headers.get('x-real-ip'), null);
}

/* ───────────── policy invariants (unchanged from v3) ───────────── */
{
  const { internals, call, cacheCalls, upstreamLog } = harness({
    upstream: async () => json({ ok: true }, { 'cache-control': 'private, no-cache' }),
  });
  const { isUpstreamCacheable, makeCacheKey } = internals;
  const r = (cc, extra = {}, status = 200) => new Response('{}', { status, headers: { 'cache-control': cc, ...extra } });

  assert.equal(isUpstreamCacheable(r('public, max-age=60')), true);
  assert.equal(isUpstreamCacheable(r('private, no-cache')), false);
  assert.equal(isUpstreamCacheable(r('no-store')), false);
  assert.equal(isUpstreamCacheable(r('public, max-age=60', { vary: 'Authorization' })), true);
  assert.equal(isUpstreamCacheable(r('public, max-age=60', { vary: 'Authorization, Cookie' })), true);
  assert.equal(isUpstreamCacheable(r('public, max-age=60', { vary: '*' })), false);
  assert.equal(isUpstreamCacheable(r('public, max-age=60', { 'set-cookie': 'session=secret' })), false);
  assert.equal(isUpstreamCacheable(r('public, max-age=60', {}, 503)), false);
  assert.equal(new URL(makeCacheKey(new URL('https://example.test/api/v1/ads?q=chair')).url).searchParams.get('__mp_cache_policy'), 'v3');

  for (const path of ['/api/v1/home/feed', '/api/v1/home/for-you']) {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-proxy-cache'), 'BYPASS');
  }
  assert.equal(upstreamLog.length, 2);
  assert.equal(cacheCalls.some(([kind]) => kind === 'match' || kind === 'put'), false);

  // Any request with credentials is passed through and never touches the shared cache.
  cacheCalls.length = 0;
  for (const headers of [{ authorization: 'Bearer x' }, { cookie: 'refreshToken=abc' }]) {
    const authed = await call('/api/v1/ads', { headers });
    assert.equal(authed.headers.get('x-proxy-cache'), 'BYPASS');
  }
  assert.equal(cacheCalls.length, 0);
}

/* ───────────── #7 key normalisation ───────────── */
{
  const { internals } = harness({ upstream: async () => json({}) });
  const key = (u) => internals.makeCacheKey(new URL(u)).url;
  const base = key('https://a.test/api/v1/ads?sort=latest&city=غزة');
  assert.equal(key('https://b.test/api/v1/ads?city=غزة&sort=latest'), base, 'order + host');
  assert.equal(key('https://a.test/api/v1/ads?city=%D8%BA%D8%B2%D8%A9&sort=latest'), base, 'percent-encoding');
  assert.equal(key('https://a.test/api/v1/ads?city=غزة&sort=latest&utm_source=fb&fbclid=1'), base, 'tracking params');
  assert.equal(key('https://a.test/api/v1/ads/?city=%D8%BA%D8%B2%D8%A9&sort=latest'), base, 'trailing slash');
  assert.equal(key('https://a.test/api/v1/ads?city=+غزة+&sort=latest'.replace(/\+/g, '%20')), base, 'edge whitespace');
  assert.equal(key('https://a.test/api/v1/ads?city=%D8%BA%D8%B2%D8%A9&sort=latest&__mp_cache_policy=v2'), base, 'spoofed policy param');
  assert.notEqual(key('https://a.test/api/v1/ads?city=رفح&sort=latest'), base, 'different value must differ');
  assert.ok(base.startsWith(`${ORIGIN}/api/v1/ads?city=`), 'host pinned to stable origin namespace across backend pool changes');
  // repeated keys keep their relative order
  assert.equal(key('https://a.test/api/v1/ads?b=2&a=1&b=1'), key('https://z.test/api/v1/ads?a=1&b=2&b=1'));
  assert.notEqual(key('https://a.test/api/v1/ads?b=2&b=1'), key('https://a.test/api/v1/ads?b=1&b=2'));
}

/* ───────────── #8 cache tags (must match backend edgePurge.ts) ───────────── */
{
  const { internals } = harness({ upstream: async () => json({}) });
  const tags = (p) => internals.edgeTagsFor(internals.canonicalize(new URL(`${EDGE}${p}`)));
  assert.equal(tags('/api/v1/ads?city=غزة'), 'api,route:ads,city:%D8%BA%D8%B2%D8%A9');
  assert.equal(tags('/api/v1/ads?city=خان%20يونس'), 'api,route:ads,city:%D8%AE%D8%A7%D9%86-%D9%8A%D9%88%D9%86%D8%B3');
  assert.equal(tags('/api/v1/ads'), 'api,route:ads,city:any');
  assert.equal(tags('/api/v1/ads/12345'), 'api,route:ads,ad:12345,city:any');
  assert.equal(tags('/api/v1/home/static?city=__ALL__'), 'api,route:home,city:__all__');
  assert.equal(tags('/api/v1/search?q=x'), 'api,route:search,city:any');
}

/* ───────────── MISS -> HIT, normalised keys, 304 ───────────── */
{
  const { call, upstreamLog, settle } = harness({ upstream: async () => json({ items: [1] }, PUBLIC_LIVE) });
  const a = await call('/api/v1/ads?sort=latest&city=%D8%BA%D8%B2%D8%A9');
  await settle();
  assert.equal(a.headers.get('x-proxy-cache'), 'MISS');
  assert.equal(a.headers.get('cache-control'), 'public, max-age=30, s-maxage=120, stale-while-revalidate=30');
  assert.match(a.headers.get('cache-tag'), /route:ads/);
  assert.equal(a.headers.get('x-mp-cache-tags'), null, 'internal revalidation metadata must not leak to clients');
  assert.deepEqual(await a.json(), { items: [1] });

  const b = await call('/api/v1/ads?city=غزة&sort=latest&utm_campaign=x');
  assert.equal(b.headers.get('x-proxy-cache'), 'HIT');
  assert.deepEqual(await b.json(), { items: [1] });
  assert.equal(upstreamLog.length, 1, 'second order/encoding variant must not reach the origin');
  assert.ok(!upstreamLog[0].url.includes('utm_'), 'tracking params not forwarded');

  const c = await call('/api/v1/ads?sort=latest&city=غزة', { headers: { 'if-none-match': '"v1"' } });
  assert.equal(c.status, 304);
  assert.equal(c.headers.get('x-proxy-cache'), 'HIT-304');
}

/* ───────────── single-flight shares a descriptor, not a consumed body ───────────── */
{
  let release;
  const gate = new Promise((r) => { release = r; });
  const { call, upstreamLog, settle } = harness({
    upstream: async () => { await gate; return json({ n: 1 }, PUBLIC_LIVE); },
  });
  const p1 = call('/api/v1/products?limit=5');
  const p2 = call('/api/v1/products?limit=5');
  await new Promise((r) => setTimeout(r, 5));
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  await settle();
  assert.equal(upstreamLog.length, 1);
  assert.deepEqual(await r1.json(), { n: 1 });
  assert.deepEqual(await r2.json(), { n: 1 }, 'second waiter must get a readable body');
  assert.deepEqual([r1, r2].map((r) => r.headers.get('x-proxy-cache')).sort(), ['MISS', 'SHARED']);
}

/* ───────────── #12 stale-while-revalidate ───────────── */
{
  let version = 1;
  const { call, upstreamLog, settle, ageEntry, store } = harness({
    upstream: async (_u, headers) => {
      if (headers.get('if-none-match') === '"v1"' && version === 1) {
        return new Response(null, { status: 304, headers: { etag: '"v1"' } });
      }
      return json({ version }, { ...PUBLIC_LIVE, etag: `"v${version}"` });
    },
  });
  await call('/api/v1/ads?limit=10'); await settle();
  assert.equal(upstreamLog.length, 1);

  // Inside ttl (120s): plain HIT.
  await ageEntry(() => true, 100);
  assert.equal((await call('/api/v1/ads?limit=10')).headers.get('x-proxy-cache'), 'HIT');

  // Past s-maxage, inside SWR (120..150s): stale answer NOW + background refresh.
  await ageEntry(() => true, 30); // total age 130s
  const stale = await call('/api/v1/ads?limit=10');
  assert.equal(stale.headers.get('x-proxy-cache'), 'STALE');
  assert.deepEqual(await stale.json(), { version: 1 });
  await settle();
  assert.equal(upstreamLog.length, 2, 'one background revalidation');
  assert.equal(upstreamLog[1].headers.get('if-none-match'), '"v1"', 'conditional revalidation');
  // 304 restarts the clock without dropping tags required by Cloudflare purge.
  // The fake Cache API strips Cache-Tag on match(), so the copy in
  // x-mp-cache-tags is what must be restored on the refreshed cache.put().
  const storedAfter304 = [...store.values()][0];
  assert.match(storedAfter304.headers.get('x-mp-cache-tags') || '', /route:ads/);
  assert.match(storedAfter304.headers.get('cache-tag') || '', /route:ads/);
  const refreshed = await call('/api/v1/ads?limit=10');
  assert.equal(refreshed.headers.get('x-proxy-cache'), 'HIT');
  assert.equal(refreshed.headers.get('x-mp-cache-tags'), null, 'internal tag backup remains private to stored cache entries');
  assert.match(refreshed.headers.get('cache-tag') || '', /route:ads/);
  assert.match(refreshed.headers.get('cache-tag') || '', /city:any/);
  assert.equal(upstreamLog.length, 2);

  // Content changed upstream: stale is served once, the refresh replaces the entry.
  version = 2;
  await ageEntry(() => true, 130);
  const stale2 = await call('/api/v1/ads?limit=10');
  assert.equal(stale2.headers.get('x-proxy-cache'), 'STALE');
  assert.deepEqual(await stale2.json(), { version: 1 });
  await settle();
  const fresh = await call('/api/v1/ads?limit=10');
  assert.equal(fresh.headers.get('x-proxy-cache'), 'HIT');
  assert.deepEqual(await fresh.json(), { version: 2 });

  // Past ttl + swr: no stale serving, synchronous MISS.
  await ageEntry(() => true, 500);
  const miss = await call('/api/v1/ads?limit=10');
  assert.equal(miss.headers.get('x-proxy-cache'), 'MISS');
}

/* ───────────── stale-on-error still works on top of SWR ───────────── */
{
  let down = false;
  const { call, settle, ageEntry } = harness({
    upstream: async () => (down ? new Response('boom', { status: 503 }) : json({ ok: 1 }, PUBLIC_LIVE)),
  });
  await call('/api/v1/stores?limit=10'); await settle();
  await ageEntry(() => true, 1000);
  down = true;
  const r = await call('/api/v1/stores?limit=10');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-proxy-cache'), 'STALE-ERROR');
}

/* ───────────── stale public data also survives a transient rate-limit response ───────────── */
{
  let limited = false;
  const { call, settle, ageEntry } = harness({
    upstream: async () => limited
      ? new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } })
      : json({ items: [{ id: 'store-1' }] }, PUBLIC_LIVE),
  });
  await call('/api/v1/stores?limit=10'); await settle();
  await ageEntry(() => true, 1000);
  limited = true;
  const response = await call('/api/v1/stores?limit=10');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-proxy-cache'), 'STALE-ERROR');
  assert.deepEqual(await response.json(), { items: [{ id: 'store-1' }] });
}

/* ───────────── #9 negative caching ───────────── */
{
  const { call, upstreamLog, settle, ageEntry } = harness({
    upstream: async (u) =>
      u.includes('/ads/typo-slug')
        ? json({ success: false, message: 'Ad not found' }, { 'cache-control': 'no-store' }, 404)
        : json({ success: false }, {}, 404),
  });
  const first = await call('/api/v1/ads/typo-slug'); await settle();
  assert.equal(first.status, 404);
  assert.equal(first.headers.get('x-proxy-cache'), 'NEG-MISS');
  const second = await call('/api/v1/ads/typo-slug');
  assert.equal(second.status, 404);
  assert.equal(second.headers.get('x-proxy-cache'), 'HIT-NEGATIVE');
  assert.deepEqual(await second.json(), { success: false, message: 'Ad not found' });
  assert.equal(upstreamLog.length, 1);

  // Negative entries are short-lived and never served stale.
  await ageEntry(() => true, 61);
  assert.equal((await call('/api/v1/ads/typo-slug')).headers.get('x-proxy-cache'), 'NEG-MISS');
  assert.equal(upstreamLog.length, 2);

  // List-level 404s are NOT cached.
  const list = await call('/api/v1/ads'); await settle();
  assert.equal(list.headers.get('x-proxy-cache'), 'BYPASS-NON200');
  await call('/api/v1/ads'); await settle();
  assert.equal(upstreamLog.length, 4);
}

/* ───────────── BYPASS-POLICY for private upstream is never stored ───────────── */
{
  const { call, store, settle } = harness({ upstream: async () => json({}, { 'cache-control': 'private, max-age=60' }) });
  const r = await call('/api/v1/ads?limit=1'); await settle();
  assert.equal(r.headers.get('x-proxy-cache'), 'BYPASS-POLICY');
  assert.equal(store.size, 0);
}

/* ───────────── legacy Cache API entries recover purge tags during 304 migration ───────────── */
{
  let version = 1;
  const h = harness({
    upstream: async (_url, headers) => headers.get('if-none-match')
      ? new Response(null, { status: 304, headers: { etag: '"legacy-v1"' } })
      : json({ version }, { ...PUBLIC_LIVE, etag: '"legacy-v1"' }),
  });
  await h.call('/api/v1/ads?limit=10'); await h.settle();
  // Simulate an entry written by the pre-fix Worker: Cloudflare strips
  // Cache-Tag and no internal backup header exists yet.
  const [legacyKey, legacyValue] = [...h.store.entries()][0];
  const legacyHeaders = new Headers(legacyValue.headers);
  legacyHeaders.delete('cache-tag');
  legacyHeaders.delete('x-mp-cache-tags');
  h.store.set(legacyKey, new Response(await legacyValue.clone().arrayBuffer(), { status: 200, headers: legacyHeaders }));
  await h.ageEntry(() => true, 130);
  const stale = await h.call('/api/v1/ads?limit=10');
  assert.equal(stale.headers.get('x-proxy-cache'), 'STALE');
  await h.settle();
  const upgraded = [...h.store.values()][0];
  assert.match(upgraded.headers.get('x-mp-cache-tags') || '', /route:ads/);
  assert.match(upgraded.headers.get('cache-tag') || '', /route:ads/);
}

/* ───────────── #10 D1 reference tier / Workers KV fallback ───────────── */
{
  const kvStore = new Map();
  const kv = {
    getWithMetadata: async (k) => {
      const e = kvStore.get(k);
      return e ? { value: e.value.slice(0), metadata: e.metadata } : { value: null, metadata: null };
    },
    put: async (k, value, opts) => { kvStore.set(k, { value, metadata: opts.metadata }); },
    list: async ({ prefix }) => ({ keys: [...kvStore.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    delete: async (k) => { kvStore.delete(k); },
  };
  const REF = { 'cache-control': 'public, max-age=300, stale-while-revalidate=600', etag: '"c1"' };
  const h = harness({
    kv,
    envOverrides: { REFERENCE_CACHE_PURGE_READY: 'true', PURGE_TOKEN: 'p'.repeat(32) },
    upstream: async () => json({ data: ['cat'] }, REF),
  });

  const miss = await h.call('/api/v1/categories'); await h.settle();
  assert.equal(miss.headers.get('x-proxy-cache'), 'MISS');
  assert.equal(kvStore.size, 1, 'reference response written to KV');
  assert.ok([...kvStore.keys()][0].startsWith('ref:v2:/api/v1/categories'));

  // Another colo (empty Cache API) is served from KV: no origin call.
  h.store.clear();
  const hit = await h.call('/api/v1/categories');
  assert.equal(hit.headers.get('x-proxy-cache'), 'KV-HIT');
  assert.deepEqual(await hit.json(), { data: ['cat'] });
  await h.settle();
  assert.equal(h.upstreamLog.length, 1, 'KV-HIT must not touch the origin (0 Neon queries)');

  // Mutable catalog D1/KV older than its 60s fresh window: serve stale, then refresh in background.
  for (const e of kvStore.values()) e.metadata.storedAt -= 2 * 60 * 1000;
  h.store.clear();
  const stale = await h.call('/api/v1/categories');
  assert.equal(stale.headers.get('x-proxy-cache'), 'KV-STALE');
  await h.settle();
  assert.equal(h.upstreamLog.length, 2);

  // Mutable route families bypass D1 until the API purge path has been
  // explicitly verified and opted in on the Worker deployment.
  const noPurgeReadyHarness = harness({ kv, upstream: async () => json({ items: [] }, REF) });
  await noPurgeReadyHarness.call('/api/v1/ads?limit=3'); await noPurgeReadyHarness.settle();
  assert.equal([...kvStore.keys()].some((k) => k.includes('/api/v1/ads?limit=3')), false);

  const mutableRefHarness = harness({
    kv,
    envOverrides: {
      REFERENCE_CACHE_LONG_TTL_ENABLED: 'true',
      REFERENCE_CACHE_PURGE_READY: 'true',
      PURGE_TOKEN: 'p'.repeat(32),
    },
    upstream: async () => json({ items: [{ id: 'ad-1' }] }, REF),
  });
  await mutableRefHarness.call('/api/v1/ads?limit=3'); await mutableRefHarness.settle();
  assert.equal([...kvStore.keys()].some((k) => k.includes('/api/v1/ads?limit=3')), true);

  // Tag purge invalidates both the native Workers Cache and the D1/KV reference tier.
  const nativeTags = await h.call('/__purge__', {
    method: 'POST',
    headers: { 'x-purge-token': 'p'.repeat(32), 'content-type': 'application/json' },
    body: JSON.stringify({ tags: ['route:categories', 'route:categories'] }),
  });
  assert.equal(nativeTags.status, 200);
  assert.deepEqual(await nativeTags.json(), { ok: true, purgedTags: 1, purgedReferenceEntries: 1 });
  assert.deepEqual(h.nativeCachePurges, [{ tags: ['route:categories'] }]);
  assert.equal(kvStore.has('ref:v2:/api/v1/categories'), false, 'tag purge must remove the matching reference entry');

  const invalidTags = await h.call('/__purge__', {
    method: 'POST', headers: { 'x-purge-token': 'p'.repeat(32), 'content-type': 'application/json' },
    body: JSON.stringify({ tags: ['route:ads\n'] }),
  });
  assert.equal(invalidTags.status, 400);
  const noNativeCacheKvStore = new Map();
  const noNativeCacheKv = {
    getWithMetadata: async (key) => {
      const entry = noNativeCacheKvStore.get(key);
      return entry ? { value: entry.value.slice(0), metadata: entry.metadata } : { value: null, metadata: null };
    },
    put: async (key, value, options) => { noNativeCacheKvStore.set(key, { value, metadata: options.metadata }); },
    list: async ({ prefix }) => ({ keys: [...noNativeCacheKvStore.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    delete: async (key) => { noNativeCacheKvStore.delete(key); },
  };
  const noNativeCache = harness({
    kv: noNativeCacheKv,
    nativeCacheUnavailable: true,
    envOverrides: { REFERENCE_CACHE_LONG_TTL_ENABLED: 'true', REFERENCE_CACHE_PURGE_READY: 'true', PURGE_TOKEN: 'p'.repeat(32) },
    upstream: async () => json({}, PUBLIC_LIVE),
  });
  await noNativeCache.call('/api/v1/ads?limit=1'); await noNativeCache.settle();
  assert.equal(noNativeCacheKvStore.size, 1, 'test fixture should contain a reference-cache entry before partial purge');
  const unavailable = await noNativeCache.call('/__purge__', {
    method: 'POST', headers: { 'x-purge-token': 'p'.repeat(32), 'content-type': 'application/json' },
    body: JSON.stringify({ tags: ['route:ads'] }),
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ok: false, error: 'WORKERS_CACHE_PURGE_UNAVAILABLE', purgedReferenceEntries: 1 });
  assert.equal(noNativeCacheKvStore.size, 0, 'D1/KV tier should still be purged when native Workers Cache is unavailable');
  const brokenNativeCache = harness({ nativeCacheFailure: true, upstream: async () => json({}) });
  const purgeFailed = await brokenNativeCache.call('/__purge__', {
    method: 'POST', headers: { 'x-purge-token': 's3cret', 'content-type': 'application/json' },
    body: JSON.stringify({ tags: ['route:ads'] }),
  });
  assert.equal(purgeFailed.status, 503);
  assert.deepEqual(await purgeFailed.json(), { ok: false, error: 'WORKERS_CACHE_PURGE_FAILED', purgedReferenceEntries: 0 });

  // /__purge__ flushes all ref:v* generations and must never erase dynamic gateway config.
  kvStore.set('gateway:registry:v1', JSON.stringify({ backend: { servers: [] } }));
  // Empty-body /__purge__ remains token-protected and flushes the KV tier.
  assert.equal((await h.call('/__purge__', { method: 'POST' })).status, 403);
  assert.equal((await h.call('/__purge__', { method: 'POST', headers: { 'x-purge-token': 'nope' } })).status, 403);
  assert.equal((await h.call('/__purge__')).status, 405);
  const purged = await h.call('/__purge__', { method: 'POST', headers: { 'x-purge-token': 'p'.repeat(32) } });
  assert.deepEqual(await purged.json(), { ok: true, deleted: 1 });
  assert.equal(kvStore.has('gateway:registry:v1'), true, 'reference purge must preserve gateway registry');
  assert.equal([...kvStore.keys()].filter((key) => key.startsWith('ref:v')).length, 0);

  const brokenKv = { list: async () => { throw new Error('KV unavailable'); } };
  const failedPurge = harness({ kv: brokenKv, upstream: async () => json({}) });
  const failed = await failedPurge.call('/__purge__', { method: 'POST', headers: { 'x-purge-token': 's3cret' } });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { ok: false, error: 'KV_PURGE_FAILED' });
}

/* ───────────── long reference TTL requires explicit purge-readiness opt-in ───────────── */
{
  const kvStore = new Map();
  const kv = {
    getWithMetadata: async (key) => {
      const entry = kvStore.get(key);
      return entry ? { value: entry.value.slice(0), metadata: entry.metadata } : { value: null, metadata: null };
    },
    put: async (key, value, options) => { kvStore.set(key, { value, metadata: options.metadata, expirationTtl: options.expirationTtl }); },
    list: async ({ prefix }) => ({ keys: [...kvStore.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    delete: async (key) => { kvStore.delete(key); },
  };
  const h = harness({
    kv,
    envOverrides: { REFERENCE_CACHE_PURGE_READY: 'true', PURGE_TOKEN: 'p'.repeat(32) },
    upstream: async () => json({ ok: true }, PUBLIC_LIVE),
  });
  await h.call('/api/v1/categories');
  await h.settle();
  assert.equal([...kvStore.values()][0].expirationTtl, 10 * 60, 'mutable catalog D1 retention is capped at 10m after purge readiness');
  kvStore.clear();

  const longTtlHarness = harness({ kv, envOverrides: { REFERENCE_CACHE_LONG_TTL_ENABLED: 'true', REFERENCE_CACHE_PURGE_READY: 'true', PURGE_TOKEN: 'p'.repeat(32) }, upstream: async () => json({ ok: true }, PUBLIC_LIVE) });
  await longTtlHarness.call('/api/v1/categories');
  await longTtlHarness.settle();
  assert.equal([...kvStore.values()][0].expirationTtl, 7 * 24 * 60 * 60, 'opt-in D1 retention is capped at 7 days');
}

/* ───────────── filtered reference caching is bounded and search is allowlisted ───────────── */
{
  const kvStore = new Map();
  const kv = {
    getWithMetadata: async (key) => {
      const entry = kvStore.get(key);
      return entry ? { value: entry.value.slice(0), metadata: entry.metadata } : { value: null, metadata: null };
    },
    put: async (key, value, options) => { kvStore.set(key, { value, metadata: options.metadata }); },
    list: async ({ prefix }) => ({ keys: [...kvStore.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    delete: async (key) => { kvStore.delete(key); },
  };
  const h = harness({
    kv,
    envOverrides: {
      REFERENCE_CACHE_LONG_TTL_ENABLED: 'true',
      REFERENCE_CACHE_PURGE_READY: 'true',
      PURGE_TOKEN: 'p'.repeat(32),
    },
    upstream: async () => json({ ok: true }, { ...PUBLIC_LIVE }),
  });

  await h.call('/api/v1/products?categoryId=cat-1&city=gaza&sortBy=price');
  await h.settle();
  const filteredKey = [...kvStore.keys()].find((key) => key.includes('/api/v1/products?'));
  assert.ok(filteredKey, 'filtered products lists should be stored in the reference tier');
  const filteredMeta = kvStore.get(filteredKey).metadata;
  assert.ok(filteredMeta.tags.includes('route:products'));
  assert.ok(filteredMeta.tags.includes('city:gaza'));

  await h.call('/api/v1/products/prod-1');
  await h.settle();
  const productDetail = [...kvStore.entries()].find(([key]) => key.endsWith('/api/v1/products/prod-1'));
  assert.ok(productDetail, 'public product detail responses use the reference tier');
  assert.ok(productDetail[1].metadata.tags.includes('product:prod-1'), 'detail cache entry carries its entity invalidation tag');

  await h.call('/api/v1/search?q=سيارة');
  await h.settle();
  assert.ok([...kvStore.keys()].some((key) => key.includes('/api/v1/search?q=')), 'allowlisted search terms use the reference tier');

  await h.call('/api/v1/search?q=استعلام-غير-موجود-في-القائمة');
  await h.call('/api/v1/ads/search?q=استعلام-آخر');
  await h.settle();
  assert.equal([...kvStore.keys()].filter((key) => key.includes('/api/v1/search')).length, 1, 'unlisted search terms must not create D1/KV rows');
  assert.equal([...kvStore.keys()].some((key) => key.includes('/api/v1/ads/search')), false, 'the nested ads search endpoint is also allowlisted');

  const canonical = h.internals.canonicalize(new URL('https://api.example.com/api/v1/products?city=gaza&_t=123&t=456&timestamp=789&probe=1'));
  assert.equal(canonical.key, '/api/v1/products?city=gaza', 'cache-buster params must not multiply cache keys');
  assert.equal(h.internals.kvEnabled({ REFERENCE_KV: kv }, h.internals.canonicalize(new URL('https://api.example.com/api/v1/search?q=' + 'x'.repeat(41)))), false, 'long free-text queries must bypass the reference tier');

  const pageOne = h.internals.canonicalize(new URL('https://api.example.com/api/v1/products?page=1&limit=10'));
  const pageTwo = h.internals.canonicalize(new URL('https://api.example.com/api/v1/products?page=2&limit=10'));
  assert.notEqual(pageOne.key, pageTwo.key, 'each paginated catalog page has its own cache key');
  assert.equal(h.internals.kvEnabled({ REFERENCE_KV: kv }, pageOne), false, 'mutable product lists are not eligible without verified purge readiness');
  assert.equal(h.internals.kvEnabled({ REFERENCE_KV: kv }, pageTwo), false, 'all mutable product pages follow the same safety gate');
  const purgeReadyEnv = {
    REFERENCE_KV: kv,
    REFERENCE_CACHE_PURGE_READY: 'true',
    PURGE_TOKEN: 'p'.repeat(32),
  };
  assert.equal(h.internals.kvEnabled(purgeReadyEnv, pageOne), true);
  assert.equal(h.internals.kvEnabled(purgeReadyEnv, pageTwo), true);
  assert.deepEqual({ ...h.internals.kvTtlPolicy(purgeReadyEnv, pageOne) }, { freshSec: 60, maxAgeSec: 600 }, 'mutable catalog routes use short default D1 TTLs after purge readiness');
  assert.deepEqual({ ...h.internals.kvTtlPolicy(purgeReadyEnv, h.internals.canonicalize(new URL('https://api.example.com/api/v1/categories'))) }, { freshSec: 60, maxAgeSec: 600 }, 'admin-managed category dictionaries are also treated as mutable');
  assert.deepEqual({ ...h.internals.kvTtlPolicy(purgeReadyEnv) }, { freshSec: 3600, maxAgeSec: 86400 }, 'unclassified reference data retains the conservative default TTL');

  const configuredTerms = Array.from({ length: 501 }, (_, i) => `term-${i}`).join('|');
  const configuredEnv = { ...purgeReadyEnv, SEARCH_CACHE_WHITELIST: configuredTerms };
  assert.equal(h.internals.kvEnabled(configuredEnv, h.internals.canonicalize(new URL('https://api.example.com/api/v1/search?q=term-488'))), true, 'the configured dictionary fills the remaining slots up to 500 total');
  assert.equal(h.internals.kvEnabled(configuredEnv, h.internals.canonicalize(new URL('https://api.example.com/api/v1/search?q=term-489'))), false, 'built-in plus configured search dictionary is capped at 500 total terms');

  const longPolicyWithoutPurge = h.internals.kvTtlPolicy({ REFERENCE_CACHE_LONG_TTL_ENABLED: 'true' });
  assert.deepEqual({ ...longPolicyWithoutPurge }, { freshSec: 3600, maxAgeSec: 86400 }, 'long TTL cannot activate without a purge secret');
  const longPolicyWithSecretOnly = h.internals.kvTtlPolicy({ REFERENCE_CACHE_LONG_TTL_ENABLED: 'true', PURGE_TOKEN: 'p'.repeat(32) });
  assert.deepEqual({ ...longPolicyWithSecretOnly }, { freshSec: 3600, maxAgeSec: 86400 }, 'a purge token alone cannot enable long TTL');
  const longPolicyWithPurge = h.internals.kvTtlPolicy({ REFERENCE_CACHE_LONG_TTL_ENABLED: 'true', REFERENCE_CACHE_PURGE_READY: 'true', PURGE_TOKEN: 'p'.repeat(32) });
  assert.deepEqual({ ...longPolicyWithPurge }, { freshSec: 86400, maxAgeSec: 604800 }, 'long TTL requires both the explicit purge-ready flag and shared secret');

  for (const path of [
    '/api/v1/categories', '/api/v1/product-categories', '/api/v1/service-categories',
    '/api/v1/service-types', '/api/v1/store-types',
    '/api/v1/home', '/api/v1/ads', '/api/v1/products', '/api/v1/stores',
    '/api/v1/service-listings', '/api/v1/service-providers', '/api/v1/service-reviews',
    '/api/v1/collections/store/store-1', '/api/v1/public/stores/market/stats',
    '/api/v1/sellers', '/api/v1/search?q=سيارة', '/api/v1/requests',
  ]) {
    const canon = h.internals.canonicalize(new URL(`https://api.example.com${path}`));
    assert.equal(h.internals.kvEnabled({ REFERENCE_KV: kv }, canon), false, `${path} must wait for explicit purge-ready mode before using D1`);
    assert.equal(h.internals.kvEnabled(purgeReadyEnv, canon), true, `${path} becomes D1-eligible only when purge readiness is explicitly enabled`);
    assert.deepEqual({ ...h.internals.kvTtlPolicy(purgeReadyEnv, canon) }, { freshSec: 60, maxAgeSec: 600 }, `${path} must use bounded mutable-content TTLs`);
  }
}


/* ───────────── public route expansion uses upstream cache policy ───────────── */
{
  const { call, settle, upstreamLog } = harness({ upstream: async () => json({ ok: true }, PUBLIC_LIVE) });
  for (const path of [
    '/api/v1/badges/store/store-1',
    '/api/v1/collections/store/store-1',
    '/api/v1/public/stores/market/stats',
    '/api/v1/service-reviews/seller/seller-1',
  ]) {
    const first = await call(path);
    await settle();
    const second = await call(path);
    assert.equal(first.headers.get('x-proxy-cache'), 'MISS', `${path} first request should populate the Worker cache`);
    assert.equal(second.headers.get('x-proxy-cache'), 'HIT', `${path} second request should use the Worker cache`);
  }
  assert.equal(upstreamLog.length, 4, 'each public route should reach the origin once');

  const privateRecs = await call('/api/v1/recommendations?type=PRODUCT');
  assert.equal(privateRecs.headers.get('x-proxy-cache'), 'BYPASS', 'recommendations remain outside the shared cache');
}

/* ───────────── native Workers Cache is default-deny outside explicit public routes ───────────── */
{
  const h = harness({
    upstream: async () => json({ private: true }, { 'cache-control': 'public, max-age=7200' }),
  });
  const cookieResponse = await h.call('/api/v1/ads', { headers: { cookie: 'session=secret' } });
  assert.equal(cookieResponse.headers.get('cache-control'), 'private, no-store');
  const dynamicResponse = await h.call('/api/v1/home/feed');
  assert.equal(dynamicResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(dynamicResponse.headers.get('x-proxy-cache'), 'BYPASS');
}

{
  const h = harness({
    envOverrides: { FRONTEND_ORIGIN: 'https://web-one.example.com,https://web-two.example.com' },
    upstream: async () => json({ public: true }, { 'cache-control': 'public, max-age=60' }),
  });
  const response = await h.call('/api/v1/ads', { headers: { origin: 'https://web-two.example.com' } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://web-two.example.com');
  assert.match(response.headers.get('vary') || '', /(?:^|, )Origin(?:,|$)/i, 'native cache must keep CORS origins in separate variants');
  assert.match(response.headers.get('vary') || '', /(?:^|, )Host(?:,|$)/i, 'native cache must isolate hostname-bound Worker responses');

  const noOrigin = await h.call('/api/v1/ads');
  assert.match(noOrigin.headers.get('vary') || '', /(?:^|, )Origin(?:,|$)/i, 'the no-Origin variant must also be isolated');
  assert.match(noOrigin.headers.get('vary') || '', /(?:^|, )Host(?:,|$)/i, 'the no-Origin variant must also be isolated by host');
  const rejectedOrigin = await h.call('/api/v1/ads', { headers: { origin: 'https://attacker.example' } });
  assert.equal(rejectedOrigin.headers.get('access-control-allow-origin'), null);
  assert.match(rejectedOrigin.headers.get('vary') || '', /(?:^|, )Origin(?:,|$)/i, 'rejected origins must not poison the allowed CORS variant');
  assert.match(rejectedOrigin.headers.get('vary') || '', /(?:^|, )Host(?:,|$)/i, 'rejected-origin responses must stay isolated by host');
}

/* ───────────── dynamic registry validation, administration, and backend failover ───────────── */
{
  const kvStore = new Map();
  const kv = {
    get: async (key, type) => {
      if (!kvStore.has(key)) return null;
      const value = kvStore.get(key);
      return type === 'json' ? JSON.parse(String(value)) : value;
    },
    getWithMetadata: async (key) => ({ value: null, metadata: null }),
    put: async (key, value, options) => {
      kvStore.set(key, value);
      if (options && options.metadata) kvStore.set(`${key}:metadata`, options.metadata);
    },
    list: async ({ prefix }) => ({ keys: [...kvStore.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    delete: async (key) => { kvStore.delete(key); },
  };
  const registry = {
    version: 1,
    backend: {
      strategy: 'weighted-random',
      servers: [
        { id: 'backend-a', url: 'https://backend-a.example.com', weight: 1000, enabled: true },
        { id: 'backend-b', url: 'https://backend-b.example.com', weight: 1, enabled: true },
      ],
    },
  };
  kvStore.set('gateway:registry:v1', JSON.stringify(registry));
  const coordinatorClass = harness({ kv }).internals.GatewayHealthCoordinator;
  const registryCoordinator = makeHealthNamespace(coordinatorClass);
  const h = harness({
    kv,
    envOverrides: { GATEWAY_ADMIN_TOKEN: 'admin-secret', GATEWAY_HEALTH: registryCoordinator },
    upstream: async (url) => {
      if (new URL(url).hostname === 'backend-a.example.com') return new Response('internal error', { status: 500 });
      return json({ backend: 'b' }, { 'cache-control': 'private, no-store' });
    },
  });
  h.context.Math.random = () => 0.5; // deterministic weighted order: backend-a first

  const failover = await h.call('/api/v1/home/feed');
  assert.equal(failover.status, 200);
  assert.deepEqual(await failover.json(), { backend: 'b' });
  assert.deepEqual(h.upstreamLog.slice(0, 2).map((entry) => new URL(entry.url).hostname), [
    'backend-a.example.com', 'backend-b.example.com',
  ]);
  assert.equal(failover.headers.get('x-mp-backend-id'), 'backend-b');
  assert.equal(failover.headers.get('x-mp-route-attempts'), '2');
  assert.equal(failover.headers.get('x-mp-route-mode'), 'pool');

  // A second 500 opens backend-a's isolate-local circuit in this no-DO scenario; the next request goes
  // directly to backend-b. This state is intentionally not written to KV per request.
  const failoverAgain = await h.call('/api/v1/home/for-you');
  assert.equal(failoverAgain.status, 200);
  const beforeThird = h.upstreamLog.length;
  const afterCircuit = await h.call('/api/v1/home/feed?next=1');
  assert.equal(afterCircuit.status, 200);
  assert.equal(h.upstreamLog.length, beforeThird + 1);
  assert.equal(new URL(h.upstreamLog[h.upstreamLog.length - 1].url).hostname, 'backend-b.example.com');

  // Registry API is server-to-server only and requires its dedicated secret.
  assert.equal((await h.call('/__gateway/registry')).status, 403);
  const adminHeaders = { 'x-gateway-admin-token': 'admin-secret' };
  const current = await h.call('/__gateway/registry', { headers: adminHeaders });
  assert.equal(current.status, 200);
  assert.equal((await current.json()).registry.backend.servers.length, 2);
  const doOnlyAdmin = harness({ upstream: async () => json({ ok: true }), envOverrides: { GATEWAY_ADMIN_TOKEN: 'admin-secret', GATEWAY_HEALTH: registryCoordinator } });
  const doOnlyCurrent = await doOnlyAdmin.call('/__gateway/registry', { headers: adminHeaders });
  assert.equal(doOnlyCurrent.status, 200, 'Durable Object is sufficient; REFERENCE_KV is only a replica');
  assert.equal((await doOnlyCurrent.json()).source, 'durable-object');

  const updated = {
    backend: {
      strategy: 'weighted-random',
      servers: [{ id: 'backend-c', url: 'https://backend-c.example.com', weight: 100, enabled: true }],
    },
  };
  const put = await h.call('/__gateway/registry', {
    method: 'PUT', headers: { ...adminHeaders, 'content-type': 'application/json' }, body: JSON.stringify(updated),
  });
  assert.equal(put.status, 200);
  const putBody = await put.json();
  assert.equal(putBody.registry.version, 2);
  assert.equal(putBody.source, 'durable-object');
  assert.deepEqual(putBody.registry.frontend.servers, []);
  assert.ok(kvStore.has('gateway:registry:v1'));

  // Concurrent admin tabs cannot silently overwrite a newer registry version.
  const stalePut = await h.call('/__gateway/registry', {
    method: 'PUT', headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, backend: { servers: [{ id: 'stale', url: 'https://stale.example.com', weight: 100, enabled: true }] } }),
  });
  assert.equal(stalePut.status, 409);
  assert.equal((await stalePut.json()).error, 'REGISTRY_VERSION_CONFLICT');
  assert.equal(JSON.parse(kvStore.get('gateway:registry:v1')).backend.servers[0].id, 'backend-c');

  const afterRegistryUpdate = await h.call('/api/v1/home/for-you?registry=updated');
  assert.equal(afterRegistryUpdate.status, 200);
  assert.equal(afterRegistryUpdate.headers.get('x-mp-backend-id'), 'backend-c', 'new registry applies without Worker code changes');
  assert.equal(new URL(h.upstreamLog[h.upstreamLog.length - 1].url).hostname, 'backend-c.example.com');

  // URL validation rejects insecure, local, credentialed, and IP-literal targets.
  const validate = h.internals.validateGatewayRegistry;
  for (const badUrl of [
    'http://backend.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://user:pass@backend.example.com',
    'https://backend.example.com/path',
  ]) {
    assert.throws(() => validate({ backend: { servers: [{ id: 'bad', url: badUrl, weight: 1, enabled: true }] } }, {}));
  }
  const invalidPut = await h.call('/__gateway/registry', {
    method: 'PUT', headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ backend: { servers: [{ id: 'bad', url: 'http://backend.example.com', weight: 1, enabled: true }] } }),
  });
  assert.equal(invalidPut.status, 400);

  // Active health probes are explicit operator actions, not scheduled warm-ups.
  const probe = await h.call('/__gateway/registry', {
    method: 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'probe' }),
  });
  assert.equal(probe.status, 200);
  const probeBody = await probe.json();
  assert.equal(probeBody.scope, 'single-request-location');
  assert.equal(probeBody.stateScope, 'central-durable-object');
  assert.equal(probeBody.results.length, 1);
  assert.equal(probeBody.results[0].id, 'backend-c');
  assert.equal(probeBody.results[0].kind, 'backend');
  assert.equal(probeBody.results[0].healthy, true, 'the configured origin returns a successful health response in this test');
  assert.equal(new URL(h.upstreamLog[h.upstreamLog.length - 1].url).pathname, '/health');

  const unsupportedProbe = await h.call('/__gateway/registry', {
    method: 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete' }),
  });
  assert.equal(unsupportedProbe.status, 400);
}

/* ───────────── provider-agnostic frontend routing, build checks, and affinity ───────────── */
{
  const registry = {
    version: 3,
    backend: { strategy: 'weighted-random', servers: [
      { id: 'api-primary', url: 'https://api-primary.example.com', weight: 100, enabled: true },
    ] },
    frontend: { strategy: 'weighted-random', servers: [
      { id: 'web-primary', url: 'https://web-primary.example.com', weight: 100, enabled: true,
        buildId: 'release-2026-a', healthPath: '/healthz', releasePath: '/build-id.json', provider: 'Render', region: 'eu-west' },
    ] },
  };
  const kvStore = new Map([['gateway:registry:v1', JSON.stringify(registry)]]);
  const kv = { get: async (key, type) => type === 'json' && kvStore.has(key) ? JSON.parse(kvStore.get(key)) : null };
  const h = harness({
    kv,
    envOverrides: { FRONTEND_GATEWAY_HOSTS: 'app.marketplat.example', GATEWAY_ALLOWED_HOSTS: '', GATEWAY_ADMIN_TOKEN: 'admin-secret' },
    upstream: async (url, headers) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'web-primary.example.com' && parsed.pathname === '/healthz') return json({ ok: true });
      if (parsed.hostname === 'web-primary.example.com' && parsed.pathname === '/build-id.json') return json({ buildId: 'release-2026-a' });
      if (parsed.hostname === 'web-primary.example.com' && parsed.pathname === '/dashboard') {
        return new Response('<html>dashboard</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return json({ upstream: parsed.hostname, forwardedHost: headers.get('x-forwarded-host') });
    },
  });
  const first = await h.callAt('app.marketplat.example', '/dashboard');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-mp-frontend-id'), 'web-primary');
  assert.equal(first.headers.get('x-mp-frontend-build-id'), 'release-2026-a');
  assert.match(first.headers.get('set-cookie') || '', /__Host-mp-frontend-release=web-primary/);
  const followup = await h.callAt('app.marketplat.example', '/_next/static/chunks/app.js', {
    headers: { cookie: '__Host-mp-frontend-release=web-primary' },
  });
  assert.equal(followup.status, 200);
  assert.equal(new URL(h.upstreamLog.at(-1).url).hostname, 'web-primary.example.com');
  assert.equal(h.upstreamLog.at(-1).headers.get('x-forwarded-host'), 'app.marketplat.example');
  assert.ok(h.upstreamLog.at(-1).init.signal, 'each routed origin request gets a per-server timeout signal');
  assert.equal(h.upstreamLog.at(-1).init.signal.aborted, false);

  const beforeUnsafePath = h.upstreamLog.length;
  const unsafePath = await h.callAt('app.marketplat.example', '//attacker.example/collect');
  assert.equal(unsafePath.status, 400, 'scheme-relative paths are rejected before any origin fetch');
  assert.equal(h.upstreamLog.length, beforeUnsafePath, 'unsafe request path never changes the configured upstream host');

  const probe = await h.call('/__gateway/registry', {
    method: 'POST', headers: { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'probe' }),
  });
  assert.equal(probe.status, 200);
  const probeBody = await probe.json();
  const frontendProbe = probeBody.results.find((result) => result.kind === 'frontend' && result.id === 'web-primary');
  assert.ok(frontendProbe, 'manual probe covers frontend origins as well as API origins');
  assert.equal(frontendProbe.healthy, true);
  assert.equal(frontendProbe.detail, 'healthy_release_match');
  const frontendProbePaths = h.upstreamLog.map((entry) => new URL(entry.url).pathname);
  assert.ok(frontendProbePaths.includes('/healthz'), 'frontend healthPath is used instead of a hard-coded /health');
  assert.ok(frontendProbePaths.includes('/build-id.json'), 'frontend release contract is checked before marking healthy');

  const validate = h.internals.validateGatewayRegistry;
  assert.throws(() => validate({
    backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] },
    frontend: { servers: [
      { id: 'one', url: 'https://one.example.com', weight: 100, enabled: true, buildId: 'release-one' },
      { id: 'two', url: 'https://two.example.com', weight: 100, enabled: true, buildId: 'release-two' },
    ] },
  }, {}), /same buildId/);
  assert.throws(() => validate({
    backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] },
    frontend: { servers: [{ id: 'web', url: 'https://web.example.com', weight: 100, enabled: true,
      buildId: 'release-one', healthPath: '//evil.example/health' }] },
  }, {}), /same-origin absolute path/);
  assert.throws(() => validate({
    backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] },
    frontend: { servers: [{ id: 'loop', url: 'https://app.marketplat.example', weight: 100, enabled: true, buildId: 'release-one' }] },
  }, { FRONTEND_GATEWAY_HOSTS: 'app.marketplat.example' }), /routing loop/);
  assert.throws(() => validate({ backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, priority: 0, enabled: true }] } }, {}), /priority/);
  assert.throws(() => validate({ backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, timeoutMs: 999, enabled: true }] } }, {}), /timeoutMs/);
  const normalized = validate({ backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] } }, {});
  assert.equal(normalized.backend.servers[0].priority, 100);
  assert.equal(normalized.backend.servers[0].timeoutMs, 20000);
  const order = h.internals.weightedPriorityOrder([
    { id: 'secondary', priority: 20, weight: 1000 },
    { id: 'primary', priority: 10, weight: 1 },
  ]);
  assert.equal(order[0].id, 'primary', 'priority tier precedes weight across tiers');
  assert.equal(order[1].id, 'secondary');
}

/* ───────────── frontend release mismatch quarantines origin from all traffic ───────────── */
{
  const registry = {
    version: 1,
    backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] },
    frontend: { servers: [{ id: 'web-stale', url: 'https://web-stale.example.com', weight: 100, enabled: true,
      buildId: 'expected-release', healthPath: '/build-id.json', releasePath: '/build-id.json' }] },
  };
  const kvStore = new Map([['gateway:registry:v1', JSON.stringify(registry)]]);
  const kv = { get: async (key, type) => type === 'json' && kvStore.has(key) ? JSON.parse(kvStore.get(key)) : null };
  const h = harness({
    kv,
    envOverrides: { FRONTEND_GATEWAY_HOSTS: 'app.marketplat.example', GATEWAY_ADMIN_TOKEN: 'admin-secret' },
    upstream: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'web-stale.example.com' && parsed.pathname === '/build-id.json') return json({ buildId: 'older-release' });
      return new Response('unexpected frontend request', { status: 200 });
    },
  });
  const probe = await h.call('/__gateway/registry', {
    method: 'POST', headers: { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'probe' }),
  });
  assert.equal(probe.status, 200);
  const body = await probe.json();
  assert.equal(body.results.find((item) => item.kind === 'frontend').detail, 'build_mismatch');
  const requestsBefore = h.upstreamLog.length;
  const blocked = await h.callAt('app.marketplat.example', '/dashboard');
  assert.equal(blocked.status, 502, 'a quarantined incompatible frontend origin is never used as a half-open fallback');
  assert.equal(h.upstreamLog.length, requestsBefore, 'quarantined origin receives no user traffic after mismatch detection');
}

/* ───────────── atomic registry compare-and-swap rejects concurrent writers ───────────── */
{
  const Coordinator = harness().internals.GatewayHealthCoordinator;
  const ns = makeHealthNamespace(Coordinator);
  const stub = ns.get();
  const initial = { version: 1, backend: { servers: [] }, frontend: { servers: [] } };
  const seed = await stub.fetch('https://gateway-registry.internal/registry/seed', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ registry: initial }),
  });
  assert.equal(seed.status, 200);
  const candidateA = { version: 2, updatedAt: 'a' };
  const candidateB = { version: 2, updatedAt: 'b' };
  const [writeA, writeB] = await Promise.all([
    stub.fetch('https://gateway-registry.internal/registry', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, registry: candidateA }) }),
    stub.fetch('https://gateway-registry.internal/registry', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, registry: candidateB }) }),
  ]);
  assert.deepEqual([writeA.status, writeB.status].sort(), [200, 409]);
  const committed = await stub.fetch('https://gateway-registry.internal/registry');
  assert.equal((await committed.json()).registry.version, 2);

  // Namespaced Frontend health IDs cannot collide with Backend or Go IDs.
  // Reconcile accepts the prefixed identifier while staying below its 80-char limit.
  const longFrontendHealthId = `frontend--${'f'.repeat(64)}`;
  const reconcile = await stub.fetch('https://gateway-health.internal/reconcile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ servers: [{ id: longFrontendHealthId, url: 'https://web-long.example.com' }] }),
  });
  assert.equal(reconcile.status, 200);
  const fullCapacity = Array.from({ length: 64 }, (_, index) => ({
    id: `go--target-${index + 1}`, url: `https://go-target-${index + 1}.example.com`,
  }));
  const fullReconcile = await stub.fetch('https://gateway-health.internal/reconcile', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servers: fullCapacity }),
  });
  assert.equal(fullReconcile.status, 200, 'health reconciliation accepts the full 16+16+32 target capacity');
  const overCapacity = await stub.fetch('https://gateway-health.internal/reconcile', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servers: [...fullCapacity, { id: 'go--target-65', url: 'https://go-target-65.example.com' }] }),
  });
  assert.equal(overCapacity.status, 400, 'health reconciliation rejects more than the full registry capacity');
  const healthWrite = await stub.fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: longFrontendHealthId, serverUrl: 'https://web-long.example.com', healthy: true, source: 'probe' }),
  });
  assert.equal(healthWrite.status, 200);
  const quarantine = await stub.fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: longFrontendHealthId, serverUrl: 'https://web-long.example.com', healthy: false, source: 'probe', quarantined: true }),
  });
  assert.equal(quarantine.status, 200);
  let healthSnapshot = await (await stub.fetch('https://gateway-health.internal/snapshot')).json();
  assert.equal(healthSnapshot.states[`${longFrontendHealthId}|https://web-long.example.com`].quarantined, true);
  const release = await stub.fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: longFrontendHealthId, serverUrl: 'https://web-long.example.com', healthy: true, source: 'probe', clearQuarantine: true }),
  });
  assert.equal(release.status, 200);
  healthSnapshot = await (await stub.fetch('https://gateway-health.internal/snapshot')).json();
  assert.equal(healthSnapshot.states[`${longFrontendHealthId}|https://web-long.example.com`].quarantined, false);
}

/* ───────────── shared health coordinator spans independent Worker isolates ───────────── */
{
  const registry = {
    version: 4,
    backend: { strategy: 'weighted-random', servers: [
      { id: 'central-a', url: 'https://central-a.example.com', weight: 1000, enabled: true },
      { id: 'central-b', url: 'https://central-b.example.com', weight: 1, enabled: true },
    ] },
  };
  const kvStore = new Map([['gateway:registry:v1', JSON.stringify(registry)]]);
  const kv = {
    get: async (key, type) => type === 'json' && kvStore.has(key) ? JSON.parse(kvStore.get(key)) : null,
    put: async (key, value) => { kvStore.set(key, value); },
  };
  const healthNamespace = makeHealthNamespace((() => {
    // The exported class is evaluated in each VM context, so create the namespace
    // from the first isolate and share its durable state with later isolates.
    const first = harness({ kv, upstream: async () => json({ ok: true }) });
    return first.internals.GatewayHealthCoordinator;
  })());
  const upstream = async (url) => new URL(url).hostname === 'central-a.example.com'
    ? new Response('temporarily unavailable', { status: 503 })
    : json({ backend: 'central-b' }, { 'cache-control': 'private, no-store' });

  const first = harness({ kv, envOverrides: { GATEWAY_HEALTH: healthNamespace }, upstream });
  first.context.Math.random = () => 0.5;
  const firstResult = await first.call('/api/v1/home/feed');
  assert.equal(firstResult.status, 200);
  await first.settle();

  // A second Worker isolate observes the first isolate's failure through the DO.
  const second = harness({ kv, envOverrides: { GATEWAY_HEALTH: healthNamespace }, upstream });
  second.context.Math.random = () => 0.5;
  const secondResult = await second.call('/api/v1/home/feed?attempt=2');
  assert.equal(secondResult.status, 200);
  await second.settle();

  const third = harness({ kv, envOverrides: { GATEWAY_HEALTH: healthNamespace, GATEWAY_ADMIN_TOKEN: 'admin-secret' }, upstream });
  third.context.Math.random = () => 0.5;
  const before = third.upstreamLog.length;
  const thirdResult = await third.call('/api/v1/home/feed?attempt=3');
  assert.equal(thirdResult.status, 200);
  assert.equal(third.upstreamLog.length, 1, 'the third isolate must skip the centrally open backend');
  assert.equal(new URL(third.upstreamLog[0].url).hostname, 'central-b.example.com');
  assert.equal(third.upstreamLog.length - before, 1);

  const admin = await third.call('/__gateway/registry', { headers: { 'x-gateway-admin-token': 'admin-secret' } });
  const adminBody = await admin.json();
  assert.equal(adminBody.healthScope, 'central-durable-object');
  const failed = adminBody.localHealth.find((entry) => entry.id === 'central-a');
  assert.equal(failed.failures, 2);
  assert.equal(failed.circuit, 'open');
  assert.equal(failed.healthy, false);

  // Reconciliation removes health history for servers no longer in the registry.
  const reconciled = await third.call('/__gateway/registry', {
    method: 'PUT',
    headers: { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ backend: { strategy: 'weighted-random', servers: [
      { id: 'central-b', url: 'https://central-b.example.com', weight: 100, enabled: true },
    ] } }),
  });
  assert.equal(reconciled.status, 200);
  const snapshot = await healthNamespace.get().fetch('https://gateway-health.internal/snapshot');
  const states = (await snapshot.json()).states;
  assert.equal(Object.keys(states).some((key) => key.startsWith('backend--central-a|')), false);

  const invalidRecord = await healthNamespace.get().fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId: 'bad id', serverUrl: 'https://central-b.example.com', healthy: false, source: 'traffic' }),
  });
  assert.equal(invalidRecord.status, 400, 'the coordinator validates health event identity and payload');
}


/* ───────────── Go adaptive weighting and traffic EWMA ───────────── */
{
  const h = harness({ upstream: async () => json({ ok: true }) });
  const validate = h.internals.validateGatewayRegistry;
  const registry = validate({
    backend: { servers: [{ id: 'api', url: 'https://api.example.com', weight: 100, enabled: true }] },
    go: { servers: [
      { id: 'go-a', serviceKey: 'analytics', routePrefix: '/internal/analytics', upstreamPrefix: '/internal/analytics', url: 'https://go-a.example.com', weight: 70, enabled: true },
      { id: 'go-b', serviceKey: 'analytics', routePrefix: '/internal/analytics', upstreamPrefix: '/internal/analytics', url: 'https://go-b.example.com', weight: 30, enabled: true },
    ] },
  }, {});
  assert.equal(registry.go.adaptive.enabled, true, 'adaptive Go routing defaults on for legacy registries');
  assert.equal(registry.go.adaptive.sensitivity, 65);
  assert.equal(registry.go.servers[0].manualSharePercent, 70);
  assert.equal(registry.go.servers[1].manualSharePercent, 30);

  const states = {
    'go--go-a|https://go-a.example.com': { failures: 0, openUntil: 0, ewmaDurationMs: 100, ewmaActiveRequests: 1, errorRate: 0, sampleCount: 20 },
    'go--go-b|https://go-b.example.com': { failures: 0, openUntil: 0, ewmaDurationMs: 500, ewmaActiveRequests: 8, errorRate: 0.2, sampleCount: 20 },
  };
  const adaptive = h.internals.goAdaptiveWeightMap(registry.go.servers, registry.go.adaptive, states);
  assert.ok(adaptive.get('go-a') > 70, 'fast and reliable replica receives an adaptive boost over its 70 baseline');
  assert.ok(adaptive.get('go-b') < 30, 'slow, busy and error-prone replica is reduced below its 30 baseline');
  const manualOnly = h.internals.goAdaptiveWeightMap(registry.go.servers, { enabled: false, sensitivity: 65 }, states);
  assert.equal(manualOnly.get('go-a'), 70);
  assert.equal(manualOnly.get('go-b'), 30);
  const concurrencyOnly = h.internals.goAdaptiveWeightMap(registry.go.servers, { enabled: true, sensitivity: 100 }, {
    'go--go-a|https://go-a.example.com': { failures: 0, openUntil: 0, ewmaDurationMs: 200, ewmaActiveRequests: 0, errorRate: 0, sampleCount: 20 },
    'go--go-b|https://go-b.example.com': { failures: 0, openUntil: 0, ewmaDurationMs: 200, ewmaActiveRequests: 20, errorRate: 0, sampleCount: 20 },
  });
  assert.ok(concurrencyOnly.get('go-a') > 70, 'less-concurrent replica gets a higher effective weight when latency and errors are equal');
  assert.ok(concurrencyOnly.get('go-b') < 30, 'more-concurrent replica gets a lower effective weight when latency and errors are equal');

  const coordinator = makeHealthNamespace(h.internals.GatewayHealthCoordinator);
  const routeRegistry = {
    backend: { servers: [{ id: 'api-primary', url: 'https://api-primary.example.com', weight: 100, enabled: true }] },
    go: { servers: [{ id: 'go-traffic', serviceKey: 'analytics', routePrefix: '/internal/analytics', upstreamPrefix: '/internal/analytics', url: 'https://go-traffic.example.com', weight: 100, enabled: true }] },
  };
  const routeHarness = harness({
    kv: { get: async (key, type) => key === 'gateway:registry:v1' && type === 'json' ? cloneJson(routeRegistry) : null },
    envOverrides: { GO_WORKER_TOKEN: 'go-secret', GATEWAY_HEALTH: coordinator },
    upstream: async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', 'x-mp-worker-active-requests': '3' } }),
  });
  for (let index = 0; index < 25; index += 1) {
    const response = await routeHarness.call('/__go/internal/analytics/summary', { headers: { authorization: 'Bearer go-secret' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-mp-worker-active-requests'), null, 'the internal load hint must not leak to API clients');
  }
  await routeHarness.settle();
  const routedSnapshot = await (await coordinator.get().fetch('https://gateway-health.internal/snapshot')).json();
  assert.equal(routedSnapshot.states['go--go-traffic|https://go-traffic.example.com'].sampleCount, 1, 'successful Go traffic is sampled into the shared health coordinator');
  assert.equal(routedSnapshot.states['go--go-traffic|https://go-traffic.example.com'].activeRequests, 3, 'the coordinator stores the live Go active-request hint');
  assert.equal(routedSnapshot.states['go--go-traffic|https://go-traffic.example.com'].ewmaActiveRequests, 3, 'the coordinator tracks EWMA concurrency for adaptive routing');

  for (let index = 0; index < 5; index += 1) {
    const response = await coordinator.get().fetch('https://gateway-health.internal/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverId: 'go--sample', serverUrl: 'https://go-sample.example.com', healthy: true, status: 200, durationMs: 120 + index * 10, activeRequests: 2 + index, source: 'traffic' }),
    });
    assert.equal(response.status, 200);
  }
  const failed = await coordinator.get().fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: 'go--sample', serverUrl: 'https://go-sample.example.com', healthy: false, status: 503, durationMs: 400, source: 'traffic' }),
  });
  assert.equal(failed.status, 200);
  const snapshot = await (await coordinator.get().fetch('https://gateway-health.internal/snapshot')).json();
  const metric = snapshot.states['go--sample|https://go-sample.example.com'];
  assert.equal(metric.sampleCount, 6, 'the coordinator tracks routed traffic samples');
  assert.ok(metric.ewmaDurationMs >= 120 && metric.ewmaDurationMs <= 400);
  assert.ok(metric.errorRate > 0 && metric.errorRate <= 1, 'failures contribute to the EWMA error ratio');
  assert.equal(metric.activeRequests, null, 'events without a load hint clear the latest instantaneous value');
  assert.ok(metric.ewmaActiveRequests >= 2 && metric.ewmaActiveRequests <= 6, 'the coordinator tracks EWMA active requests');

  const manualProbe = await coordinator.get().fetch('https://gateway-health.internal/record', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverId: 'go--sample', serverUrl: 'https://go-sample.example.com', healthy: true, status: 200, durationMs: 1, activeRequests: 0, source: 'probe' }),
  });
  assert.equal(manualProbe.status, 200);
  const afterProbe = await (await coordinator.get().fetch('https://gateway-health.internal/snapshot')).json();
  assert.equal(afterProbe.states['go--sample|https://go-sample.example.com'].sampleCount, 6, 'manual probes must not bias adaptive traffic metrics');
  assert.equal(afterProbe.states['go--sample|https://go-sample.example.com'].ewmaActiveRequests, metric.ewmaActiveRequests, 'manual probes must not bias the concurrency signal');
  assert.equal(afterProbe.states['go--sample|https://go-sample.example.com'].activeRequests, metric.activeRequests, 'manual probes must preserve the latest traffic load hint');
}

/* ───────────── mutating requests are never automatically replayed ───────────── */
{
  const kvStore = new Map([['gateway:registry:v1', JSON.stringify({
    backend: { servers: [
      { id: 'primary', url: 'https://primary.example.com', weight: 100, enabled: true },
      { id: 'secondary', url: 'https://secondary.example.com', weight: 1, enabled: true },
    ] },
  })]]);
  const kv = { get: async (key, type) => type === 'json' && kvStore.has(key) ? JSON.parse(kvStore.get(key)) : null };
  const h = harness({ kv, upstream: async () => new Response('unavailable', { status: 503 }) });
  h.context.Math.random = () => 0.5;
  const response = await h.call('/api/v1/ads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'test' }) });
  assert.equal(response.status, 503);
  assert.equal(h.upstreamLog.length, 1, 'POST must never be replayed to another backend automatically');
  assert.equal(response.headers.get('x-mp-route-attempts'), '1');
}

/* ───────────── multi-service Go gateway, auth, rewrite, and failover ───────────── */
{
  const makeGoRegistry = (goServers) => ({
    version: 7,
    backend: { strategy: 'weighted-random', servers: [
      { id: 'api-primary', url: 'https://api-primary.example.com', weight: 100, priority: 100, enabled: true },
    ] },
    frontend: { strategy: 'weighted-random', servers: [] },
    go: { strategy: 'weighted-random', servers: goServers },
  });
  const kvFor = (registry) => ({
    get: async (key, type) => key === 'gateway:registry:v1' && type === 'json' ? cloneJson(registry) : null,
  });
  const target = (overrides = {}) => ({
    id: 'analytics-primary', serviceKey: 'analytics',
    routePrefix: '/internal/analytics', upstreamPrefix: '/internal/compute',
    url: 'https://go-analytics.example.com', weight: 100, priority: 10,
    timeoutMs: 60000, enabled: true, healthPath: '/healthz',
    ...overrides,
  });

  // The public Go route is closed unless the Worker has its own shared secret.
  {
    const h = harness({ kv: kvFor(makeGoRegistry([target()])), upstream: async () => json({ ok: true }) });
    const missing = await h.call('/__go/internal/analytics/summary', {
      headers: { authorization: 'Bearer go-secret' },
    });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error, 'GO_GATEWAY_NOT_CONFIGURED');
    assert.equal(h.upstreamLog.length, 0);
  }

  // Authentication is checked before route resolution or origin contact.
  {
    const h = harness({
      kv: kvFor(makeGoRegistry([target()])),
      envOverrides: { GO_WORKER_TOKEN: 'go-secret' },
      upstream: async () => json({ ok: true }),
    });
    assert.equal((await h.call('/__go/internal/analytics/summary')).status, 401);
    assert.equal((await h.call('/__go/internal/analytics/summary', { headers: { authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await h.call('/__go/internal/other/summary', { headers: { authorization: 'Bearer go-secret' } })).status, 404);
    assert.equal(h.upstreamLog.length, 0);
    assert.equal((await h.call('/__go/internal/analytics/summary', {
      method: 'PUT', headers: { authorization: 'Bearer go-secret' },
    })).status, 405);
  }

  // Gateway-visible prefix is rewritten to the path expected by the Go service.
  {
    const h = harness({
      kv: kvFor(makeGoRegistry([target()])),
      envOverrides: { GO_WORKER_TOKEN: 'go-secret' },
      upstream: async (url) => json({ path: new URL(url).pathname, service: 'analytics' }),
    });
    const response = await h.call('/__go/internal/analytics/daily?range=7', {
      headers: {
        authorization: 'Bearer go-secret', cookie: 'session=must-not-forward',
        'x-forwarded-for': '198.51.100.88', 'cf-connecting-ip': '203.0.113.9',
        'x-mp-go-service': 'spoofed-service', 'x-mp-go-target': 'spoofed-target', 'x-mp-route-mode': 'spoofed-mode',
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { path: '/internal/compute/daily', service: 'analytics' });
    assert.equal(h.upstreamLog[0].url, 'https://go-analytics.example.com/internal/compute/daily?range=7');
    assert.equal(h.upstreamLog[0].headers.get('authorization'), 'Bearer go-secret');
    assert.equal(h.upstreamLog[0].headers.get('cookie'), null, 'caller cookies must not cross into internal Go services');
    assert.equal(h.upstreamLog[0].headers.get('x-forwarded-for'), '203.0.113.9', 'spoofed forwarded IP must be replaced by Cloudflare client IP');
    assert.equal(h.upstreamLog[0].headers.get('x-mp-go-service'), 'analytics', 'caller-supplied internal service metadata must be overwritten');
    assert.equal(h.upstreamLog[0].headers.get('x-mp-go-target'), 'analytics-primary', 'the gateway must identify the actual selected replica');
    assert.equal(h.upstreamLog[0].headers.get('x-mp-route-mode'), null, 'caller-supplied route metadata must be stripped');
    assert.equal(response.headers.get('x-mp-go-service'), 'analytics');
    assert.equal(response.headers.get('x-mp-go-target'), 'analytics-primary');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }

  // A logical service can have multiple replicas; safe GET requests fail over by priority.
  {
    const servers = [
      target({ id: 'analytics-primary', url: 'https://go-a.example.com', priority: 10, weight: 100 }),
      target({ id: 'analytics-secondary', url: 'https://go-b.example.com', priority: 20, weight: 100 }),
    ];
    const h = harness({
      kv: kvFor(makeGoRegistry(servers)),
      envOverrides: { GO_WORKER_TOKEN: 'go-secret' },
      upstream: async (url) => new URL(url).hostname === 'go-a.example.com'
        ? json({ error: 'temporarily unavailable' }, {}, 503)
        : json({ ok: true, target: 'secondary' }),
    });
    const response = await h.call('/__go/internal/analytics/summary', {
      headers: { authorization: 'Bearer go-secret' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, target: 'secondary' });
    assert.deepEqual(h.upstreamLog.map((entry) => new URL(entry.url).hostname), ['go-a.example.com', 'go-b.example.com']);
    assert.equal(response.headers.get('x-mp-route-attempts'), '2');
    assert.equal(response.headers.get('x-mp-go-target'), 'analytics-secondary');
  }

  // Mutating POST requests are never retried by the gateway, even with another replica.
  {
    const servers = [
      target({ id: 'analytics-primary', url: 'https://go-a.example.com', priority: 10 }),
      target({ id: 'analytics-secondary', url: 'https://go-b.example.com', priority: 20 }),
    ];
    const h = harness({
      kv: kvFor(makeGoRegistry(servers)),
      envOverrides: { GO_WORKER_TOKEN: 'go-secret' },
      upstream: async () => json({ error: 'unavailable' }, {}, 503),
    });
    const response = await h.call('/__go/internal/analytics/rollup', {
      method: 'POST', headers: { authorization: 'Bearer go-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ batchSize: 500 }),
    });
    assert.equal(response.status, 503);
    assert.equal(h.upstreamLog.length, 1, 'Go POST must never be replayed to another replica');
    assert.equal(response.headers.get('x-mp-route-attempts'), '1');
    assert.deepEqual(JSON.parse(await new Response(h.upstreamLog[0].init.body).text()), { batchSize: 500 });
  }

  // Bound read-only failover work so a large Go pool cannot fan one request across every target.
  {
    const servers = [1, 2, 3, 4].map((n) => target({
      id: `analytics-${n}`, url: `https://go-${n}.example.com`, priority: n, weight: 100,
    }));
    const h = harness({
      kv: kvFor(makeGoRegistry(servers)), envOverrides: { GO_WORKER_TOKEN: 'go-secret' },
      upstream: async () => json({ error: 'temporarily unavailable' }, {}, 503),
    });
    const response = await h.call('/__go/internal/analytics/status', {
      headers: { authorization: 'Bearer go-secret' },
    });
    assert.equal(response.status, 503);
    assert.equal(h.upstreamLog.length, 3, 'Go GET failover is bounded to three attempts');
    assert.equal(response.headers.get('x-mp-route-attempts'), '3');
    assert.deepEqual(await response.json(), { error: 'temporarily unavailable' }, 'the final failed upstream response body must remain readable');
  }

  // Different logical Go services may have different route prefixes and origins.
  {
    const registry = makeGoRegistry([
      target({ id: 'analytics-1' }),
      target({ id: 'push-1', serviceKey: 'push', routePrefix: '/internal/push', upstreamPrefix: '/internal/push', url: 'https://go-push.example.com' }),
    ]);
    const h = harness({
      kv: kvFor(registry), envOverrides: {
        GO_WORKER_TOKEN: 'gateway-ingress-secret',
        GO_WORKER_TOKENS_JSON: JSON.stringify({ analytics: 'a'.repeat(40), push: 'p'.repeat(40) }),
      },
      upstream: async (url, headers) => json({ host: new URL(url).hostname, authorization: headers.get('authorization') }),
    });
    const response = await h.call('/__go/internal/push/dispatch/worker-status', {
      headers: { authorization: 'Bearer gateway-ingress-secret' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { host: 'go-push.example.com', authorization: `Bearer ${'p'.repeat(40)}` });
    const analytics = await h.call('/__go/internal/analytics/summary', {
      headers: { authorization: 'Bearer gateway-ingress-secret' },
    });
    assert.deepEqual(await analytics.json(), { host: 'go-analytics.example.com', authorization: `Bearer ${'a'.repeat(40)}` });

    // One existing Go monolith may expose multiple logical services on the same origin.
    const sharedOriginRegistry = makeGoRegistry([
      target({ id: 'analytics-on-monolith', url: 'https://go-monolith.example.com' }),
      target({ id: 'push-on-monolith', serviceKey: 'push', routePrefix: '/internal/push', upstreamPrefix: '/internal/push', url: 'https://go-monolith.example.com' }),
    ]);
    const sharedOrigin = harness({
      kv: kvFor(sharedOriginRegistry), envOverrides: { GO_WORKER_TOKEN: 'gateway-ingress-secret' },
      upstream: async (url) => json({ host: new URL(url).host, path: new URL(url).pathname }),
    });
    const sharedAnalytics = await sharedOrigin.call('/__go/internal/analytics/summary', { headers: { authorization: 'Bearer gateway-ingress-secret' } });
    const sharedPush = await sharedOrigin.call('/__go/internal/push/dispatch/worker-status', { headers: { authorization: 'Bearer gateway-ingress-secret' } });
    assert.equal((await sharedAnalytics.json()).host, 'go-monolith.example.com');
    assert.equal((await sharedPush.json()).path, '/internal/push/dispatch/worker-status');
    assert.equal(sharedOrigin.upstreamLog.length, 2, 'one Go origin may be registered under multiple logical route services');

    const missingProfile = harness({
      kv: kvFor(makeGoRegistry([target({ serviceKey: 'maintenance', routePrefix: '/internal/maintenance', upstreamPrefix: '/internal/maintenance' })])),
      envOverrides: { GO_WORKER_TOKEN: 'gateway-ingress-secret', GO_WORKER_TOKENS_JSON: JSON.stringify({ analytics: 'a'.repeat(40) }) },
      upstream: async () => json({ ok: true }),
    });
    const rejected = await missingProfile.call('/__go/internal/maintenance/run', {
      headers: { authorization: 'Bearer gateway-ingress-secret' },
    });
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).error, 'GO_SERVICE_TOKEN_NOT_CONFIGURED');
    assert.equal(missingProfile.upstreamLog.length, 0);

    for (const invalidToken of ['too-short', `${'x'.repeat(32)}\r\nX-Injected: yes`, 'x'.repeat(1025)]) {
      const invalidProfile = harness({
        kv: kvFor(makeGoRegistry([target({ serviceKey: 'analytics', routePrefix: '/internal/analytics', upstreamPrefix: '/internal/analytics' })])),
        envOverrides: { GO_WORKER_TOKEN: 'gateway-ingress-secret', GO_WORKER_TOKENS_JSON: JSON.stringify({ analytics: invalidToken }) },
        upstream: async () => json({ ok: true }),
      });
      const invalidResponse = await invalidProfile.call('/__go/internal/analytics/summary', {
        headers: { authorization: 'Bearer gateway-ingress-secret' },
      });
      assert.equal(invalidResponse.status, 503, 'invalid service tokens fail closed');
      assert.equal(invalidProfile.upstreamLog.length, 0);
    }
  }

  // A disabled more-specific service must not leak into a broader enabled service.
  {
    const registry = makeGoRegistry([
      target({ id: 'jobs-general', serviceKey: 'jobs', routePrefix: '/internal/jobs', upstreamPrefix: '/internal/jobs', url: 'https://go-jobs.example.com' }),
      target({ id: 'analytics-retention', serviceKey: 'analytics-retention', routePrefix: '/internal/jobs/analytics-retention', upstreamPrefix: '/internal/jobs/analytics-retention', url: 'https://go-analytics.example.com', enabled: false }),
    ]);
    const h = harness({ kv: kvFor(registry), envOverrides: { GO_WORKER_TOKEN: 'go-secret' }, upstream: async () => json({ ok: true }) });
    const response = await h.call('/__go/internal/jobs/analytics-retention', {
      headers: { authorization: 'Bearer go-secret' },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).service, 'analytics-retention');
    assert.equal(h.upstreamLog.length, 0, 'disabled specific route must not fall through to a broader Go route');
  }

  // Invalid route maps are rejected instead of silently splitting replicas of one service.
  {
    const validate = harness({ upstream: async () => json({ ok: true }) }).internals.validateGatewayRegistry;
    assert.throws(() => validate(makeGoRegistry([
      target({ id: 'analytics-a', upstreamPrefix: '/internal/compute' }),
      target({ id: 'analytics-b', url: 'https://go-b.example.com', upstreamPrefix: '/internal/other' }),
    ]), {}), /same routePrefix and upstreamPrefix/);
    assert.throws(() => validate(makeGoRegistry([
      target({ id: 'analytics-a' }),
      target({ id: 'push-b', serviceKey: 'push', routePrefix: '/internal/analytics', upstreamPrefix: '/internal/push' }),
    ]), {}), /already assigned/);
    assert.throws(() => validate(makeGoRegistry([
      target({ id: 'analytics-a', url: 'https://go-same.example.com' }),
      target({ id: 'analytics-b', url: 'https://go-same.example.com' }),
    ]), {}), /same origin more than once/);
    const maxGoServices = Array.from({ length: 32 }, (_, index) => target({
      id: `service-${index + 1}`, serviceKey: `service-${index + 1}`,
      routePrefix: `/internal/service-${index + 1}`, upstreamPrefix: `/internal/service-${index + 1}`,
      url: `https://go-${index + 1}.example.com`,
    }));
    assert.equal(validate(makeGoRegistry(maxGoServices), {}).go.servers.length, 32);
    assert.throws(() => validate(makeGoRegistry([...maxGoServices, target({
      id: 'service-33', serviceKey: 'service-33', routePrefix: '/internal/service-33',
      upstreamPrefix: '/internal/service-33', url: 'https://go-33.example.com',
    })]), {}), /Go service pool must contain 0-32 targets/);
  }

  // Go services participate in manual health checks and have collision-proof central health IDs.
  {
    const registry = makeGoRegistry([target()]);
    registry.backend.servers = [{
      id: 'go--analytics-primary', url: 'https://go-analytics.example.com',
      weight: 100, priority: 100, timeoutMs: 20000, enabled: true,
    }];
    const coordinatorFactory = harness({ upstream: async () => json({ ok: true }) });
    const healthNamespace = makeHealthNamespace(coordinatorFactory.internals.GatewayHealthCoordinator);
    const h = harness({
      kv: kvFor(registry), envOverrides: {
        GO_WORKER_TOKEN: 'go-secret', GATEWAY_ADMIN_TOKEN: 'admin-secret', GATEWAY_HEALTH: healthNamespace,
      },
      upstream: async (url) => json({ status: 'ok' }, {}, new URL(url).pathname === '/healthz' || new URL(url).pathname === '/health' ? 200 : 404),
    });
    const response = await h.call('/__gateway/registry', {
      method: 'POST', headers: { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'probe' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const goResult = body.results.find((result) => result.kind === 'go' && result.id === 'analytics-primary');
    assert.ok(goResult);
    assert.equal(goResult.healthy, true);
    assert.equal(h.upstreamLog.some((entry) => new URL(entry.url).pathname === '/healthz'), true);

    const protectedProbeRegistry = makeGoRegistry([target({ healthPath: '/internal/diagnostics' })]);
    const protectedProbe = harness({
      kv: kvFor(protectedProbeRegistry),
      envOverrides: {
        GO_WORKER_TOKEN: 'gateway-ingress-secret',
        GO_WORKER_TOKENS_JSON: JSON.stringify({ analytics: 'service-health-token-012345678901234567890' }),
        GATEWAY_ADMIN_TOKEN: 'admin-secret',
      },
      upstream: async (url, headers) => {
        assert.equal(new URL(url).pathname, '/internal/diagnostics');
        assert.equal(headers.get('authorization'), 'Bearer service-health-token-012345678901234567890');
        return json({ status: 'ready' });
      },
    });
    const protectedProbeResponse = await protectedProbe.call('/__gateway/registry', {
      method: 'POST', headers: { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'probe', targetIds: [{ kind: 'go', id: 'analytics-primary' }] }),
    });
    assert.equal(protectedProbeResponse.status, 200);
    assert.equal((await protectedProbeResponse.json()).results[0].healthy, true);

    const stateResponse = await healthNamespace.get().fetch('https://gateway-health.internal/snapshot');
    const states = (await stateResponse.json()).states;
    assert.ok(states['go--analytics-primary|https://go-analytics.example.com']);
    assert.ok(states['backend--go--analytics-primary|https://go-analytics.example.com']);
    assert.notEqual(
      states['go--analytics-primary|https://go-analytics.example.com'],
      undefined,
      'Go health identity is distinct from a Backend id that could otherwise collide',
    );
  }
}

/* ───────────── private D1 feature-flag control plane + audit history ───────────── */
{
  const values = new Map();
  const auditRows = [];
  let failNextUpsert = false;
  const db = {
    prepare(sql) {
      let bound = [];
      const statement = {
        bind(...args) { bound = args; return this; },
        async run() {
          if (sql.includes('INSERT INTO feature_flag_audit')) {
            const [name, newEnabled, newRollout, changedBy, changedAt, lookupName, compareEnabled, compareRollout] = bound;
            const previous = values.get(lookupName);
            if (previous && previous.enabled === compareEnabled && previous.rollout_percent === compareRollout) {
              return { success: true, meta: { changes: 0 } };
            }
            auditRows.push({
              id: auditRows.length + 1,
              flag_name: name,
              old_enabled: previous?.enabled ?? null,
              new_enabled: newEnabled,
              old_rollout_percent: previous?.rollout_percent ?? null,
              new_rollout_percent: newRollout,
              changed_by: changedBy,
              changed_at: changedAt,
            });
          } else if (sql.includes('INSERT INTO feature_flags')) {
            if (failNextUpsert) { failNextUpsert = false; throw new Error('simulated D1 upsert failure'); }
            const [name, enabled, rolloutPercent, updatedAt] = bound;
            values.set(name, { name, enabled, rollout_percent: rolloutPercent, updated_at: updatedAt });
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          if (sql.includes('PRAGMA table_info(feature_flags)')) {
            return { results: ['name', 'enabled', 'rollout_percent', 'updated_at'].map((name) => ({ name })) };
          }
          if (sql.includes('SELECT name, enabled, rollout_percent, updated_at FROM feature_flags')) {
            return { results: [...values.values()].sort((a, b) => a.name.localeCompare(b.name)) };
          }
          if (sql.includes('FROM feature_flag_audit ORDER BY id DESC LIMIT')) {
            const limit = Number(bound[0]);
            return { results: auditRows.slice(-limit).reverse() };
          }
          return { results: [] };
        },
      };
      return statement;
    },
    async batch(statements) {
      // D1 executes a batch sequentially and transactionally. This fake
      // preserves statement order and rolls back both tables on failure.
      const previousValues = new Map(values);
      const previousAuditLength = auditRows.length;
      const results = [];
      try {
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        values.clear();
        for (const [key, value] of previousValues) values.set(key, value);
        auditRows.length = previousAuditLength;
        throw error;
      }
    },
  };
  const h = harness({ envOverrides: { DB: db, FEATURE_FLAGS_ADMIN_TOKEN: 'flags-secret-0123456789abcdef0123456789' } });
  assert.equal((await h.call('/__gateway/feature-flags')).status, 403, 'feature flag control plane must reject unauthenticated access');
  const headers = { 'x-feature-flags-token': 'flags-secret-0123456789abcdef0123456789', 'content-type': 'application/json' };
  const empty = await h.call('/__gateway/feature-flags', { headers });
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).flags, []);

  const missingActor = await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers, body: JSON.stringify({ name: 'PUBLIC_NEW_SEARCH', enabled: true, rolloutPercent: 35 }),
  });
  assert.equal(missingActor.status, 400, 'audited updates must require a trusted actor ID');

  const saved = await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-1' },
    body: JSON.stringify({ name: 'PUBLIC_NEW_SEARCH', enabled: true, rolloutPercent: 35 }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.flag.name, 'PUBLIC_NEW_SEARCH');
  assert.equal(savedBody.flag.enabled, true);
  assert.equal(savedBody.flag.rolloutPercent, 35);
  const listed = await h.call('/__gateway/feature-flags', { headers }).then((r) => r.json());
  assert.equal(listed.flags[0].enabled, true);
  assert.equal(listed.flags[0].rolloutPercent, 35);
  assert.equal(listed.audit.length, 1);
  assert.equal(listed.audit[0].oldEnabled, null, 'new flags record a NULL previous state');
  assert.equal(listed.audit[0].enabled, true);
  assert.equal(listed.audit[0].changedBy, 'root-1');

  await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-2' },
    body: JSON.stringify({ name: 'PUBLIC_NEW_SEARCH', enabled: false, rolloutPercent: 20 }),
  });
  const changed = await h.call('/__gateway/feature-flags', { headers }).then((r) => r.json());
  assert.equal(changed.audit.length, 2);
  assert.equal(changed.audit[0].oldEnabled, true);
  assert.equal(changed.audit[0].enabled, false);
  assert.equal(changed.audit[0].oldRolloutPercent, 35);
  assert.equal(changed.audit[0].rolloutPercent, 20);
  assert.equal(changed.audit[0].changedBy, 'root-2');

  await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-2' },
    body: JSON.stringify({ name: 'PUBLIC_NEW_SEARCH', enabled: false, rolloutPercent: 20 }),
  });
  const afterNoOp = await h.call('/__gateway/feature-flags', { headers }).then((r) => r.json());
  assert.equal(afterNoOp.audit.length, 2, 'writing the same value must not create a false change event');

  failNextUpsert = true;
  const failedBatch = await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-2' },
    body: JSON.stringify({ name: 'PUBLIC_ROLLBACK_TEST', enabled: true, rolloutPercent: 10 }),
  });
  assert.equal(failedBatch.status, 503);
  const afterRollback = await h.call('/__gateway/feature-flags', { headers }).then((r) => r.json());
  assert.equal(afterRollback.audit.length, 2, 'failed D1 batch must roll back the audit row');
  assert.equal(afterRollback.flags.some((flag) => flag.name === 'PUBLIC_ROLLBACK_TEST'), false, 'failed D1 batch must not leave the flag behind');

  await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-1' },
    body: JSON.stringify({ name: 'INTERNAL_OPERATIONS_SWITCH', enabled: true, rolloutPercent: 100 }),
  });
  const publicFlags = await h.call('/__gateway/public-feature-flags');
  assert.equal(publicFlags.status, 200);
  const publicBody = await publicFlags.json();
  assert.deepEqual(publicBody.flags, { PUBLIC_NEW_SEARCH: { enabled: false, rolloutPercent: 20 } });
  assert.equal('audit' in publicBody, false, 'public feature flags must never expose audit history');
  assert.equal((await h.call('/__gateway/public-feature-flags', { method: 'PUT', headers })).status, 405);

  const invalid = await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-1' }, body: JSON.stringify({ name: 'new flag', enabled: true }),
  });
  assert.equal(invalid.status, 400, 'flag keys must use bounded UPPER_SNAKE_CASE identifiers');
  const invalidPercent = await h.call('/__gateway/feature-flags', {
    method: 'PUT', headers: { ...headers, 'x-feature-flags-actor': 'root-1' }, body: JSON.stringify({ name: 'PUBLIC_BAD_ROLLOUT', enabled: true, rolloutPercent: 101 }),
  });
  assert.equal(invalidPercent.status, 400, 'rollout percent must be an integer from 0 to 100');
  const wrongToken = await h.call('/__gateway/feature-flags', { headers: { 'x-feature-flags-token': 'wrong' } });
  assert.equal(wrongToken.status, 403);

  // A pre-rollout table is upgraded additively and existing rows default to 100%.
  let migrated = false;
  const oldDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { if (sql.startsWith('ALTER TABLE feature_flags ADD COLUMN rollout_percent')) migrated = true; return { success: true }; },
        async all() {
          if (sql.includes('PRAGMA table_info(feature_flags)')) {
            return { results: ['name', 'enabled', 'updated_at', ...(migrated ? ['rollout_percent'] : [])].map((name) => ({ name })) };
          }
          if (sql.includes('SELECT name, enabled, rollout_percent, updated_at FROM feature_flags')) {
            return { results: [{ name: 'PUBLIC_OLD_FLAG', enabled: 1, updated_at: 10, rollout_percent: 100 }] };
          }
          if (sql.includes('FROM feature_flag_audit ORDER BY id DESC LIMIT')) return { results: [] };
          return { results: [] };
        },
      };
    },
  };
  const oldSchema = harness({ envOverrides: { DB: oldDb, FEATURE_FLAGS_ADMIN_TOKEN: 'flags-secret-0123456789abcdef0123456789' } });
  const migratedResponse = await oldSchema.call('/__gateway/feature-flags', { headers });
  assert.equal(migratedResponse.status, 200);
  assert.equal(migrated, true, 'legacy feature_flags schema must gain rollout_percent');
  assert.equal((await migratedResponse.json()).flags[0].rolloutPercent, 100);
}

/* ───────────── bounded D1 gateway health history snapshots ───────────── */
{
  const batched = [];
  const executed = [];
  const db = {
    prepare(sql) {
      let values = [];
      return {
        sql,
        bind(...args) { values = args; this.values = values; return this; },
        async run() { executed.push({ sql, values }); return { meta: { changes: 3 } }; },
        async all() { return { results: [] }; },
      };
    },
    async batch(statements) { batched.push(...statements); return []; },
  };
  const state = {
    failures: 0, openUntil: 0, healthy: true, status: 200, durationMs: 42,
    quarantined: false, errorRate: 0.05, ewmaDurationMs: 38, sampleCount: 12,
    source: 'traffic', updatedAt: Date.now(), checkedAt: new Date().toISOString(),
  };
  const env = {
    DB: db,
    GATEWAY_HEALTH: {
      idFromName: () => 'health-do',
      get: () => ({ fetch: async () => Response.json({ states: { 'backend--origin-a|https://origin-a.example': state } }) }),
    },
  };
  const count = await harness({ upstream: async () => json({}) }).internals.exportGatewayHealthHistory(env, 1_800_000);
  assert.equal(count, 1);
  assert.equal(batched.length, 1, 'server snapshots must be written through one D1 batch');
  assert.match(batched[0].sql, /INSERT INTO gateway_health_history/);
  assert.equal(batched[0].values[0], 'backend--origin-a');
  assert.equal(batched[0].values[1], 'https://origin-a.example');
  assert.equal(batched[0].values[2], 1_800_000 / 1000 / 900 * 900);
  assert.equal(batched[0].values[3], 1);
  const pruned = await harness({ upstream: async () => json({}) }).internals.pruneGatewayHealthHistory(db, 3_000_000);
  assert.equal(pruned, 3);
  assert.ok(executed.some((entry) => entry.sql.includes('DELETE FROM gateway_health_history')));
}

/* ───────────── bounded manual health probe batches ───────────── */
{
  const servers = Array.from({ length: 10 }, (_, index) => ({
    id: `probe-${index + 1}`, url: `https://probe-${index + 1}.example.com`,
    weight: 100, priority: 100, timeoutMs: 20000, enabled: true,
  }));
  const registry = {
    version: 2,
    backend: { strategy: 'weighted-random', servers },
    frontend: { strategy: 'weighted-random', servers: [] },
    go: { strategy: 'weighted-random', servers: [] },
  };
  const kv = { get: async (key, type) => key === 'gateway:registry:v1' && type === 'json' ? cloneJson(registry) : null };
  const h = harness({
    kv,
    envOverrides: { GATEWAY_ADMIN_TOKEN: 'admin-secret' },
    upstream: async (url) => json({ ok: true }, {}, new URL(url).pathname === '/health' ? 200 : 404),
  });
  const headers = { 'x-gateway-admin-token': 'admin-secret', 'content-type': 'application/json' };
  const unbatched = await h.call('/__gateway/registry', {
    method: 'POST', headers, body: JSON.stringify({ action: 'probe' }),
  });
  assert.equal(unbatched.status, 413, 'large health pools must require explicit bounded batches');
  assert.equal((await unbatched.json()).error, 'PROBE_BATCH_REQUIRED');
  assert.equal(h.upstreamLog.length, 0, 'oversized probe requests must not contact origins');

  const firstBatch = await h.call('/__gateway/registry', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'probe', targetIds: servers.slice(0, 8).map(({ id }) => ({ kind: 'backend', id })) }),
  });
  assert.equal(firstBatch.status, 200);
  const first = await firstBatch.json();
  assert.equal(first.results.length, 8);
  assert.equal(first.scope, 'selected-target-batch');
  assert.equal(h.upstreamLog.length, 8);

  const secondBatch = await h.call('/__gateway/registry', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'probe', targetIds: servers.slice(8).map(({ id }) => ({ kind: 'backend', id })) }),
  });
  assert.equal(secondBatch.status, 200);
  const second = await secondBatch.json();
  assert.equal(second.results.length, 2);
  assert.equal(h.upstreamLog.length, 10);
  assert.equal(second.results.every((result) => result.healthy), true);

  const duplicate = await h.call('/__gateway/registry', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'probe', targetIds: [{ kind: 'backend', id: 'probe-1' }, { kind: 'backend', id: 'probe-1' }] }),
  });
  assert.equal(duplicate.status, 400);
  assert.equal((await duplicate.json()).error, 'DUPLICATE_PROBE_TARGET');

  const oversizedBatch = await h.call('/__gateway/registry', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'probe', targetIds: servers.map(({ id }) => ({ kind: 'backend', id })) }),
  });
  assert.equal(oversizedBatch.status, 400);
  assert.equal((await oversizedBatch.json()).error, 'INVALID_PROBE_TARGETS');

  const staleTarget = await h.call('/__gateway/registry', {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'probe', targetIds: [{ kind: 'go', id: 'no-longer-registered' }] }),
  });
  assert.equal(staleTarget.status, 409, 'stale admin UI target references must not be reported as successful empty probes');
  assert.equal((await staleTarget.json()).error, 'PROBE_TARGET_NOT_FOUND');
}

/* ───────────── scheduled warm-up is bounded; manual warm-up stays disabled ───────────── */
{
  const h = harness({ upstream: async () => json({ items: [] }, PUBLIC_LIVE) });
  assert.equal(typeof h.context.__worker.scheduled, 'function', 'scheduled cache warmer must be deployed');
  const scheduledTasks = [];
  await h.context.__worker.scheduled({ cron: '0 */6 * * *' }, {}, {
    waitUntil: (promise) => scheduledTasks.push(Promise.resolve(promise)),
  });
  while (scheduledTasks.length) await Promise.all(scheduledTasks.splice(0));
  assert.equal(h.upstreamLog.length, 12, 'cron should warm only the fixed allowlisted public paths');
  assert.ok(h.upstreamLog.some((entry) => entry.url.includes('/api/v1/sellers/ranking?limit=20')), 'seller ranking is prewarmed as a real public route');
  assert.ok(h.upstreamLog.some((entry) => entry.url.endsWith('/api/v1/home/static')));

  const disabled = await h.call('/__warm__');
  assert.equal(disabled.status, 404, 'manual warm-up endpoint must remain disabled');
}

/* ───────────── cache-busting shapes are never stored ───────────── */
{
  const h = harness({ upstream: async () => json({ ok: 1 }, PUBLIC_LIVE) });
  const many = Array.from({ length: 20 }, (_, i) => `p${i}=${i}`).join('&');
  const r = await h.call(`/api/v1/ads?${many}`);
  assert.equal(r.headers.get('x-proxy-cache'), 'BYPASS-SHAPE');
  const long = await h.call(`/api/v1/ads?q=${'x'.repeat(1100)}`);
  assert.equal(long.headers.get('x-proxy-cache'), 'BYPASS-SHAPE');
  await h.settle();
  assert.equal(h.store.size, 0);
  // a normal request is still cached
  assert.equal((await h.call('/api/v1/ads?limit=5')).headers.get('x-proxy-cache'), 'MISS');
}

/* ───────────── Cache API failures degrade to origin passthrough ───────────── */
{
  for (const failure of ['match', 'put']) {
    const h = harness({ cacheFailure: failure, upstream: async () => json({ ok: true }, PUBLIC_LIVE) });
    const first = await h.call('/api/v1/ads?limit=7');
    assert.equal(first.status, 200, `${failure} failure must not fail the request`);
    assert.deepEqual(await first.json(), { ok: true });
    const second = await h.call('/api/v1/ads?limit=7');
    assert.equal(second.status, 200);
    assert.equal(h.upstreamLog.length, 2, `${failure} failure must not pretend an entry was cached`);
  }
}

/* ───────────── configured origin and origin validation ───────────── */
{
  const h = harness({
    envOverrides: { RENDER_ORIGIN: 'https://api-origin.example.test' },
    upstream: async () => json({ ok: true }, PUBLIC_LIVE),
  });
  await h.call('/api/v1/ads');
  assert.equal(new URL(h.upstreamLog[0].url).origin, 'https://api-origin.example.test');
  assert.ok([...h.store.keys()][0].startsWith('https://api-origin.example.test/'));
  const validate = h.context.__internals.getRenderOrigin;
  assert.throws(() => validate({ RENDER_ORIGIN: 'http://insecure.example.test' }), /HTTPS origin/);
}

/* ───────────── credentialed CORS must fail closed without an allow-list ───────────── */
{
  const h = harness({ upstream: async () => json({ ok: true }) });
  const unconfigured = await h.call('/api/v1/home/feed', { headers: { origin: 'https://attacker.example' } });
  assert.equal(unconfigured.headers.get('access-control-allow-origin'), '');
  const rejected = await h.context.__worker.fetch(
    new Request(`${EDGE}/api/v1/home/feed`, { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } }),
    { FRONTEND_ORIGIN: 'https://marketplat.app' },
    { waitUntil() {} },
  );
  assert.equal(rejected.headers.get('access-control-allow-origin'), '');
  const allowed = await h.context.__worker.fetch(
    new Request(`${EDGE}/api/v1/home/feed`, { method: 'OPTIONS', headers: { origin: 'https://marketplat.app' } }),
    { FRONTEND_ORIGIN: 'https://marketplat.app' },
    { waitUntil() {} },
  );
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://marketplat.app');
}

/* ───────────── optional Analytics Engine metrics ───────────── */
{
  const points = [];
  const h = harness({ upstream: async () => json({ ok: 1 }, PUBLIC_LIVE) });
  const env = { CACHE_METRICS: { writeDataPoint: (p) => points.push(p) } };
  const ctx = { waitUntil: (p) => p };
  await h.context.__worker.fetch(new Request(`${EDGE}/api/v1/ads?limit=1`), env, ctx);
  await h.context.__worker.fetch(new Request(`${EDGE}/api/v1/ads?limit=1`), env, ctx);
  assert.deepEqual(points.map((p) => p.blobs[0]), ['MISS', 'HIT']);
  assert.equal(points[0].blobs[1], 'ads');
  // a throwing binding must never break the response
  const broken = { CACHE_METRICS: { writeDataPoint: () => { throw new Error('x'); } } };
  const ok = await h.context.__worker.fetch(new Request(`${EDGE}/api/v1/ads?limit=1`), broken, ctx);
  assert.equal(ok.status, 200);
}

{
  // Regression: tail logs showed 12 registry reads in the same second and ~380 health
  // writes in 30 minutes. Concurrent cache misses must share one DO read, and failed
  // requests against an already-open circuit must not each write to the DO again.
  const registryDoc = { backend: { servers: [{ id: 'api-primary', url: 'https://api-primary.example.com', weight: 100, enabled: true }] } };
  const calls = { registry: 0, snapshot: 0, record: 0 };
  const countingNamespace = {
    idFromName: (name) => ({ name }),
    get: () => ({
      fetch: async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method || 'GET').toUpperCase();
        await new Promise((resolve) => setTimeout(resolve, 15));
        if (url.endsWith('/registry') && method === 'GET') { calls.registry += 1; return json({ registry: registryDoc }); }
        if (url.endsWith('/snapshot')) { calls.snapshot += 1; return json({ states: {}, updatedAt: null }); }
        if (url.endsWith('/record')) { calls.record += 1; return json({ ok: true }); }
        return json({ ok: true });
      },
    }),
  };
  const flightHarness = harness({ upstream: async () => new Response('upstream down', { status: 503 }) });
  const flightEnv = { GATEWAY_HEALTH: countingNamespace, PURGE_TOKEN: 's3cret' };

  const loads = await Promise.all(Array.from({ length: 12 }, () => flightHarness.internals.loadGatewayRegistry(flightEnv)));
  assert.equal(calls.registry, 1, '12 concurrent registry cache misses must share a single Durable Object read');
  assert.ok(loads.every((load) => load === loads[0]), 'all concurrent callers receive the same load result');
  await flightHarness.internals.loadGatewayRegistry(flightEnv);
  assert.equal(calls.registry, 1, 'a warm registry cache serves later callers without another DO read');
  await flightHarness.internals.loadGatewayRegistry(flightEnv, true);
  assert.equal(calls.registry, 2, 'a forced reload (admin save/refresh) bypasses cache and in-flight sharing');

  const pending = [];
  const flightCtx = { waitUntil: (promise) => pending.push(Promise.resolve(promise).catch(() => {})) };
  for (let index = 0; index < 8; index += 1) {
    await flightHarness.internals.fetchBackend('/api/v1/ping', { method: 'GET' }, flightEnv, false, flightCtx);
  }
  while (pending.length) await Promise.all(pending.splice(0));
  assert.equal(calls.snapshot, 1, 'health snapshot is read once, then served from the isolate cache');
  assert.equal(calls.record, 2, 'only the failures that open the circuit (threshold 2) are written; later failures while open are not');
}

const wrangler = fs.readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
assert.ok(wrangler.includes('crons = [\"0 */6 * * *\", \"*/15 * * * *\", \"30 3 * * *\"]'), 'six-hour cache warm, 15-minute health snapshots, and daily D1 cleanup crons must be configured');
assert.ok(wrangler.includes('[[analytics_engine_datasets]]'), 'Workers Analytics Engine binding must be enabled in production config');
assert.ok(wrangler.includes('binding = \"CACHE_METRICS\"') && wrangler.includes('dataset = \"marketplat_cache\"'), 'cache metrics dataset must be configured');

console.log('PASS API Worker cache/gateway: policy, SWR, negative cache, tagged D1/KV tier, filtered-query cache, scheduled warm/cleanup, feature-flag rollout control plane, batched D1 health history, analytics binding, single-flight, dynamic routing, failover');
