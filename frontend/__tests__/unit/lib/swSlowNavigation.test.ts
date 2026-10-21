/**
 * REGRESSION (FIX SW-SLOW-NAV-01): a slow or non-OK navigation response must be
 * passed through, never masked by the /offline page. /offline is for a real
 * network failure only. Loads the real public/sw.js in a vm sandbox.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');

function load() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: any) => (typeof r === 'string' ? (r.startsWith('http') ? r : `https://example.com${r}`) : r.url);
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
    self: { addEventListener() {}, skipWaiting() {}, clients: { claim: async () => {}, matchAll: async () => [] }, registration: {}, location: { origin: 'https://example.com' } },
    caches, fetch: (i: any) => currentFetch(typeof i === 'string' ? i : i.url), indexedDB: {},
    console: { log() {}, warn() {}, error() {} },
    atob, btoa, URL, URLSearchParams, Headers, TextEncoder, Blob, Response, Request, AbortController, DOMException, queueMicrotask, setTimeout, clearTimeout,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${SRC}\nself.__STATIC = STATIC_CACHE;`, sb, { filename: 'sw.js' });
  return { sb, setFetch: (f: typeof currentFetch) => { currentFetch = f; } };
}

const html = (b: string) => `<!doctype html><html><body><div>${b}</div></body></html>`;
const res = (b: string, status = 200) => new Response(html(b), { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const navReq = (href: string) => {
  const mk = (): any => ({ url: href, method: 'GET', headers: new Headers(), mode: 'navigate', destination: 'document', cache: 'default', redirect: 'manual', clone: mk });
  return mk();
};

async function navigate(path: string, fetchImpl: (u: string) => Promise<Response>) {
  const ctx = load();
  const c = await ctx.sb.caches.open(ctx.sb.self.__STATIC);
  await c.put('/offline', res('OFFLINE-PAGE'));
  ctx.setFetch(fetchImpl);
  const url = new URL(`https://example.com${path}`);
  const r: Response = await ctx.sb.handlePageRequest({ waitUntil() {} }, navReq(url.href), url);
  return { status: r.status, text: await r.text() };
}

describe('SW navigation does not mask real responses with /offline', () => {
  it('passes through a 404 on a public page with no cached shell', async () => {
    const r = await navigate('/ads/xyz', async () => res('NOT-FOUND', 404));
    expect(r.status).toBe(404);
    expect(r.text).toContain('NOT-FOUND');
  });

  it('passes through a 503 on a public page with no cached shell', async () => {
    const r = await navigate('/products', async () => res('UNAVAILABLE', 503));
    expect(r.status).toBe(503);
    expect(r.text).toContain('UNAVAILABLE');
  });

  it('waits for a slow public page (> NETWORK_TIMEOUT_MS) instead of serving /offline', async () => {
    const r = await navigate('/products', () => new Promise((ok) => setTimeout(() => ok(res('REAL-PAGE')), 5600)));
    expect(r.text).toContain('REAL-PAGE');
  }, 15_000);

  it('waits for a slow protected page with no cached shell instead of serving /offline', async () => {
    const r = await navigate('/dashboard', () => new Promise((ok) => setTimeout(() => ok(res('REAL-DASH')), 5600)));
    expect(r.text).toContain('REAL-DASH');
  }, 15_000);

  it('still serves /offline when the network really fails', async () => {
    const pub = await navigate('/products', async () => { throw new TypeError('Failed to fetch'); });
    const prot = await navigate('/dashboard', async () => { throw new TypeError('Failed to fetch'); });
    expect(pub.text).toContain('OFFLINE-PAGE');
    expect(prot.text).toContain('OFFLINE-PAGE');
  });
});
