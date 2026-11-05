/**
 * REGRESSIONS (weak-network hardening) — loads the real public/sw.js in a vm
 * sandbox, like swSlowNavigation.test.ts.
 *
 *  - FIX WEAK-NET-5XX-01: a transient 408/429/5xx from the gateway must not hide
 *    a valid cached snapshot of a public API GET. With no snapshot the original
 *    error response is passed through untouched.
 *  - FIX WEAK-NET-REPLAY-01: the offline-queue replay timeout scales with the
 *    request body size and the reported network tier, and always stays below
 *    the processing lease so a slow upload cannot be re-claimed mid-flight.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');
const ORIGIN = 'https://example.com';

function load() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: any) => (typeof r === 'string' ? (r.startsWith('http') ? r : `${ORIGIN}${r}`) : r.url);
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const s = stores.get(name)!;
      return {
        match: async (r: any) => s.get(key(r))?.clone(),
        put: async (r: any, res: Response) => { s.set(key(r), res); },
        delete: async (r: any) => s.delete(key(r)),
        keys: async () => [...s.keys()].map((url) => ({ url })),
      };
    },
    delete: async (n: string) => stores.delete(n),
    keys: async () => [...stores.keys()],
    match: async () => undefined,
  };
  let currentFetch: (u: string) => Promise<Response> = async () => { throw new Error('no fetch'); };
  const sb: Record<string, any> = {
    self: {
      addEventListener() {},
      skipWaiting() {},
      clients: { claim: async () => {}, matchAll: async () => [] },
      registration: {},
      location: { origin: ORIGIN },
    },
    caches,
    fetch: (i: any) => currentFetch(typeof i === 'string' ? i : i.url),
    indexedDB: {},
    console: { log() {}, warn() {}, error() {} },
    atob, btoa, URL, URLSearchParams, Headers, TextEncoder, Blob, Response, Request, AbortController, DOMException, queueMicrotask, setTimeout, clearTimeout,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${SRC}\nself.__API = API_CACHE;`, sb, { filename: 'sw.js' });
  return {
    sb,
    setFetch: (f: typeof currentFetch) => { currentFetch = f; },
    run: (code: string) => vm.runInContext(code, sb),
  };
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });

const apiReq = (href: string) => {
  const mk = (): any => ({ url: href, method: 'GET', headers: new Headers(), mode: 'cors', destination: '', cache: 'default', clone: mk });
  return mk();
};

async function seedSnapshot(ctx: ReturnType<typeof load>, href: string, body: unknown, ageMs: number) {
  const cache = await ctx.sb.caches.open(ctx.sb.self.__API);
  await cache.put(href, json(body, 200, { 'X-SW-Cached-At': String(Date.now() - ageMs) }));
}

async function getApi(ctx: ReturnType<typeof load>, href: string) {
  const url = new URL(href);
  const r: Response = await ctx.sb.networkFirstApi({ waitUntil() {} }, apiReq(href), url);
  return { status: r.status, headers: r.headers, body: await r.text() };
}

describe('SW networkFirstApi falls back to a cached snapshot on transient upstream errors', () => {
  const href = `${ORIGIN}/api/v1/ads`;

  it.each([408, 429, 500, 502, 503, 504])('serves the fresh cached snapshot when upstream answers %i', async (status) => {
    const ctx = load();
    await seedSnapshot(ctx, href, { data: ['cached'] }, 60_000);
    ctx.setFetch(async () => json({ message: 'upstream down' }, status));
    const r = await getApi(ctx, href);
    expect(r.status).toBe(200);
    expect(r.body).toContain('cached');
  });

  it('serves a stale-but-in-grace snapshot and flags it with X-SW-Stale', async () => {
    const ctx = load();
    await seedSnapshot(ctx, href, { data: ['old'] }, 3 * 24 * 60 * 60 * 1000);
    ctx.setFetch(async () => json({ message: 'bad gateway' }, 502));
    const r = await getApi(ctx, href);
    expect(r.status).toBe(200);
    expect(r.headers.get('X-SW-Stale')).toBe('1');
    expect(r.body).toContain('old');
  });

  it('passes the original error response through when nothing is cached', async () => {
    const ctx = load();
    ctx.setFetch(async () => json({ message: 'overloaded' }, 503));
    const r = await getApi(ctx, href);
    expect(r.status).toBe(503);
    expect(r.body).toContain('overloaded');
  });

  it('never masks a real client error (404) with a cached snapshot', async () => {
    const ctx = load();
    await seedSnapshot(ctx, href, { data: ['cached'] }, 60_000);
    ctx.setFetch(async () => json({ message: 'not found' }, 404));
    const r = await getApi(ctx, href);
    expect(r.status).toBe(404);
  });

  it('does not use cached data for sensitive admin endpoints', async () => {
    const ctx = load();
    const adminHref = `${ORIGIN}/api/v1/admin/stats`;
    await seedSnapshot(ctx, adminHref, { data: ['secret'] }, 1_000);
    ctx.setFetch(async () => json({ message: 'down' }, 503));
    const r = await getApi(ctx, adminHref);
    expect(r.status).toBe(503);
    expect(r.body).not.toContain('secret');
  });

  it('does not cache the error response itself', async () => {
    const ctx = load();
    ctx.setFetch(async () => json({ message: 'down' }, 503));
    await getApi(ctx, href);
    const cache = await ctx.sb.caches.open(ctx.sb.self.__API);
    expect(await cache.match(href)).toBeUndefined();
  });
});

describe('SW offline-queue replay timeout adapts to body size and network tier', () => {
  const MB = 1024 * 1024;
  const entryWith = (bytes: number) => ({ body: bytes > 0 ? { size: bytes } : null });

  it('keeps the historical 15s budget for small bodies on an unclassified network', () => {
    const ctx = load();
    expect(ctx.sb.replayTimeoutMsFor(entryWith(0))).toBe(15_000);
  });

  it('gives a 3 MB upload far more than 15s on a slow tier', () => {
    const ctx = load();
    ctx.run("queueNetworkTier = 'slow'");
    expect(ctx.sb.replayTimeoutMsFor(entryWith(3 * MB))).toBeGreaterThan(60_000);
  });

  it('is larger on a very-slow tier than on a fast one for the same body', () => {
    const ctx = load();
    ctx.run("queueNetworkTier = 'very-slow'");
    const slow = ctx.sb.replayTimeoutMsFor(entryWith(1 * MB));
    ctx.run("queueNetworkTier = 'fast'");
    const fast = ctx.sb.replayTimeoutMsFor(entryWith(1 * MB));
    expect(slow).toBeGreaterThan(fast);
  });

  it('never exceeds the cap, which stays below the processing lease', () => {
    const ctx = load();
    ctx.run("queueNetworkTier = 'very-slow'");
    const t = ctx.sb.replayTimeoutMsFor(entryWith(6 * MB));
    const cap = ctx.run('QUEUE_REQUEST_TIMEOUT_MAX_MS') as number;
    const lease = ctx.run('QUEUE_PROCESSING_LEASE_MS') as number;
    expect(t).toBe(cap);
    expect(cap).toBeLessThan(lease);
  });

  it('falls back to the unknown tier for unrecognised hints', () => {
    const ctx = load();
    ctx.run("queueNetworkTier = 'offline'");
    expect(ctx.sb.replayTimeoutMsFor(entryWith(0))).toBe(15_000);
  });
});
