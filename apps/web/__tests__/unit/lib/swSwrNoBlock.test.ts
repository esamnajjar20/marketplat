/**
 * REGRESSION (FIX SW-SWR-NOBLOCK-01): with no cached shell, staleWhileRevalidatePage
 * must return the real response as soon as it arrives. Chunk prefetch + cache writes
 * continue in the background (event.waitUntil), they must not delay first paint.
 * Loads the real public/sw.js in a vm sandbox (same pattern as swSlowNavigation.test.ts).
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

const PAGE = '<!doctype html><html><head><script src="/_next/static/chunks/a.js"></script></head><body>REAL-PAGE</body></html>';
const htmlRes = (b: string, status = 200) => new Response(b, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const navReq = (href: string) => {
  const mk = (): any => ({ url: href, method: 'GET', headers: new Headers(), mode: 'navigate', destination: 'document', cache: 'default', redirect: 'manual', clone: mk });
  return mk();
};

describe('SWR navigation does not wait for chunk prefetch', () => {
  it('returns the page immediately on a first visit even when chunk downloads are slow', async () => {
    const ctx = load();
    const c = await ctx.sb.caches.open(ctx.sb.self.__STATIC);
    await c.put('/offline', htmlRes('OFFLINE-PAGE'));
    ctx.setFetch((u) => u.includes('/_next/static/')
      ? new Promise((ok) => setTimeout(() => ok(new Response('//js', { status: 200, headers: { 'content-type': 'application/javascript' } })), 4000))
      : Promise.resolve(htmlRes(PAGE)));
    const pending: Promise<unknown>[] = [];
    const url = new URL('https://example.com/products');
    const t0 = Date.now();
    const r: Response = await ctx.sb.handlePageRequest({ waitUntil: (p: Promise<unknown>) => pending.push(p) }, navReq(url.href), url);
    const elapsed = Date.now() - t0;
    expect(await r.text()).toContain('REAL-PAGE');
    expect(elapsed).toBeLessThan(1000);          // not held back by the 4s chunk download
    expect(pending.length).toBeGreaterThan(0);   // background work is still registered
    await Promise.allSettled(pending);
  }, 15_000);
});
