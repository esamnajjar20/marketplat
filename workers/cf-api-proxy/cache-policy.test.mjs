import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
  .replace('export default {', 'globalThis.__worker = {');

const ORIGIN = 'https://marketplat.onrender.com';
const EDGE = 'https://marketplat-api.esamnajjar6.workers.dev';

/** Fresh isolate per scenario: fake Cache API, fake KV, scripted origin. */
function harness({ upstream, kv } = {}) {
  const store = new Map();
  const cacheCalls = [];
  const cache = {
    match: async (key) => {
      cacheCalls.push(['match', key.url]);
      const hit = store.get(key.url);
      return hit ? hit.clone() : undefined;
    },
    put: async (key, res) => {
      cacheCalls.push(['put', key.url]);
      store.set(key.url, res.clone());
    },
  };
  const upstreamLog = [];
  const context = {
    URL, Request, Response, Headers, Map, Set, Date, Math, String, Number, JSON, Promise, RegExp, Object, Array,
    encodeURIComponent, decodeURIComponent,
    console: { log() {}, error() {} },
    caches: { default: cache },
    fetch: async (url, init = {}) => {
      const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
      upstreamLog.push({ url: String(url), headers });
      return upstream(String(url), headers, upstreamLog.length);
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.__internals = { isUpstreamCacheable, makeCacheKey, edgeTagsFor, canonicalize };`, context);
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})) };
  const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
  const env = kv ? { REFERENCE_KV: kv, PURGE_TOKEN: 's3cret' } : { PURGE_TOKEN: 's3cret' };
  const call = (path, init) => context.__worker.fetch(new Request(`${EDGE}${path}`, init), env, ctx);
  // Age a stored entry by `seconds` (rewrites x-mp-stored-at).
  const ageEntry = async (matcher, seconds) => {
    for (const [k, v] of store) {
      if (!matcher(k)) continue;
      const h = new Headers(v.headers);
      h.set('x-mp-stored-at', String(Number(h.get('x-mp-stored-at')) - seconds * 1000));
      store.set(k, new Response(await v.clone().arrayBuffer(), { status: 200, headers: h }));
    }
  };
  return { context, call, store, cacheCalls, upstreamLog, settle, ageEntry, internals: context.__internals };
}

const json = (body, headers = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const PUBLIC_LIVE = {
  'cache-control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=30',
  vary: 'Authorization',
  etag: '"v1"',
};

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
    assert.equal(response.headers.get('cache-control'), 'private, no-cache');
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
  assert.ok(base.startsWith(`${ORIGIN}/api/v1/ads?city=`), 'host pinned to origin so warm-up and requests share keys');
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
  const { call, upstreamLog, settle, ageEntry } = harness({
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
  // 304 restarted the clock -> fresh again with NO new origin call.
  assert.equal((await call('/api/v1/ads?limit=10')).headers.get('x-proxy-cache'), 'HIT');
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

/* ───────────── #10 Workers KV tier ───────────── */
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
  const h = harness({ kv, upstream: async () => json({ data: ['cat'] }, REF) });

  const miss = await h.call('/api/v1/categories'); await h.settle();
  assert.equal(miss.headers.get('x-proxy-cache'), 'MISS');
  assert.equal(kvStore.size, 1, 'reference response written to KV');
  assert.ok([...kvStore.keys()][0].startsWith('ref:v1:/api/v1/categories'));

  // Another colo (empty Cache API) is served from KV: no origin call.
  h.store.clear();
  const hit = await h.call('/api/v1/categories');
  assert.equal(hit.headers.get('x-proxy-cache'), 'KV-HIT');
  assert.deepEqual(await hit.json(), { data: ['cat'] });
  await h.settle();
  assert.equal(h.upstreamLog.length, 1, 'KV-HIT must not touch the origin (0 Neon queries)');

  // KV older than KV_FRESH (15 min): serve it, refresh in background.
  for (const e of kvStore.values()) e.metadata.storedAt -= 20 * 60 * 1000;
  h.store.clear();
  const stale = await h.call('/api/v1/categories');
  assert.equal(stale.headers.get('x-proxy-cache'), 'KV-STALE');
  await h.settle();
  assert.equal(h.upstreamLog.length, 2);

  // Non-reference routes never use KV.
  await h.call('/api/v1/ads?limit=3'); await h.settle();
  assert.equal([...kvStore.keys()].some((k) => k.includes('/ads')), false);

  // /__purge__ is token-protected and flushes the KV tier.
  assert.equal((await h.call('/__purge__', { method: 'POST' })).status, 403);
  assert.equal((await h.call('/__purge__', { method: 'POST', headers: { 'x-purge-token': 'nope' } })).status, 403);
  assert.equal((await h.call('/__purge__')).status, 405);
  const purged = await h.call('/__purge__', { method: 'POST', headers: { 'x-purge-token': 's3cret' } });
  assert.deepEqual(await purged.json(), { ok: true, deleted: 1 });
  assert.equal(kvStore.size, 0);
}

/* ───────────── warm-up writes the SAME keys real requests read ───────────── */
{
  const h = harness({ upstream: async () => json({ items: [] }, PUBLIC_LIVE) });
  const warmed = [];
  await h.context.__worker.scheduled({}, {}, { waitUntil: (p) => warmed.push(p) });
  await Promise.all(warmed);
  await h.context.__worker.fetch(new Request(`${EDGE}/__warm__`), {}, { waitUntil() {} });
  const before = h.upstreamLog.length;
  const r = await h.call('/api/v1/ads?limit=10');
  assert.equal(r.headers.get('x-proxy-cache'), 'HIT', 'warmed entry must be hit by a real request');
  assert.equal(h.upstreamLog.length, before);
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

/* ───────────── keep-warm: no origin hit while entries are young; token guard ───────────── */
{
  const h = harness({ upstream: async () => json({ items: [] }, PUBLIC_LIVE) });
  const env = {};
  const pend = [];
  const ctx = { waitUntil: (p) => pend.push(p) };
  const cron = async () => { await h.context.__worker.scheduled({}, env, ctx); await Promise.all(pend.splice(0)); };
  await cron();
  const afterFirst = h.upstreamLog.length;
  assert.equal(afterFirst, 13, 'first warm populates every path');
  await cron();
  assert.equal(h.upstreamLog.length, afterFirst, 'second warm right after must not touch the origin');
  // entries past 50% of ttl (120s) get renewed
  await h.ageEntry(() => true, 70);
  await cron();
  assert.equal(h.upstreamLog.length, afterFirst * 2, 'aged entries are renewed');

  const guarded = { PURGE_TOKEN: 's3cret' };
  const denied = await h.context.__worker.fetch(new Request(`${EDGE}/__warm__`), guarded, ctx);
  assert.equal(denied.status, 403);
  const allowed = await h.context.__worker.fetch(
    new Request(`${EDGE}/__warm__`, { headers: { 'x-purge-token': 's3cret' } }), guarded, ctx);
  assert.equal(allowed.status, 200);
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

console.log('PASS API Worker cache: policy, key normalisation, SWR, negative cache, KV tier, tags, single-flight');
