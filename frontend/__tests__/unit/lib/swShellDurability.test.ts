/**
 * __tests__/unit/lib/swShellDurability.test.ts
 *
 * يختبر سلوك public/sw.js الفعلي (vm + caches وهمية) للإصلاحات الخمسة:
 *  - إعادة محاولة حفظ الصفحة بدل الفشل الصامت،
 *  - حفظ الصفحة المُحوَّلة تحت رابطها النهائي (وبدون كسر حماية صفحات الدخول)،
 *  - ترحيل الصفحات عند رفع CACHE_VERSION (بما فيها الشخصية) مع ملفاتها،
 *  - عرض لقطة API قديمة (فترة السماح) للبيانات العامة فقط.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const SW_SOURCE = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');
const ORIGIN = 'https://example.com';
const DAY = 86_400_000;

function loadSw(opts: { onLine?: boolean } = {}) {
  const stores = new Map<string, Map<string, any>>();
  const messages: any[] = [];
  const keyOf = (r: any) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  const fakeCaches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const st = stores.get(name)!;
      return {
        match: async (req: any) => st.get(keyOf(req)),
        put: async (req: any, res: any) => { st.set(keyOf(req), res); },
        delete: async (req: any) => st.delete(keyOf(req)),
        keys: async () => Array.from(st.keys()).map((url) => ({ url })),
      };
    },
    delete: async (n: string) => stores.delete(n),
    keys: async () => Array.from(stores.keys()),
    match: async () => undefined,
  };
  let currentFetch: (i: any, init?: any) => Promise<Response> = async () => { throw new TypeError('no fetch'); };
  const sandbox: Record<string, any> = {
    self: {
      addEventListener() {}, skipWaiting() {},
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (m: any) => messages.push(m) }] },
      registration: {}, location: { origin: ORIGIN },
      navigator: opts.onLine === undefined ? undefined : { onLine: opts.onLine },
    },
    caches: fakeCaches, fetch: (...a: any[]) => currentFetch(a[0], a[1]), indexedDB: {}, console,
    atob, btoa, URL, URLSearchParams, Headers, TextEncoder, Blob, Response, Request, AbortController,
    DOMException, queueMicrotask, setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    `${SW_SOURCE}\nself.__STATIC=STATIC_CACHE;self.__PERSONAL=PERSONAL_SHELL_CACHE;self.__API=API_CACHE;self.__META=SW_META_CACHE;`,
    sandbox, { filename: 'sw.js' },
  );
  return {
    sb: sandbox, messages, fakeCaches,
    setFetch: (f: (i: any, init?: any) => Promise<Response>) => { currentFetch = f; },
    has: async (cache: string, url: string) => !!(await (await fakeCaches.open(cache)).match(url)),
  };
}

const page = (body: string, assets: string[] = []) =>
  `<!doctype html><html><head>${assets.map((a) => (a.endsWith('.css') ? `<link href="${a}" rel="stylesheet">` : `<script src="${a}"></script>`)).join('')}</head><body>${body}</body></html>`;
const htmlRes = (body: string, assets?: string[]) => new Response(page(body, assets), { status: 200, headers: { 'content-type': 'text/html' } });
const jsRes = () => new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript' } });
const redirected = (res: Response, finalUrl: string) => {
  Object.defineProperty(res, 'redirected', { value: true });
  Object.defineProperty(res, 'url', { value: finalUrl });
  return res;
};
const pathOf = (i: any) => new URL(typeof i === 'string' ? i : i.url, ORIGIN).pathname;

describe('sw.js — redirected documents (FIX SHELL-REDIRECT-01)', () => {
  it('caches a same-origin redirect under its FINAL url', async () => {
    const ctx = loadSw();
    ctx.setFetch(async (i) => {
      if (pathOf(i) === '/old-page') return redirected(htmlRes('final', ['/_next/static/a.js']), `${ORIGIN}/new-page`);
      if (pathOf(i) === '/_next/static/a.js') return jsRes();
      throw new TypeError('unexpected');
    });
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__STATIC);
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/old-page`), cache);
    expect(await ctx.has(ctx.sb.self.__STATIC, `${ORIGIN}/new-page`)).toBe(true);
  });

  it('never caches a redirect that lands on /login (logged-out protected page)', async () => {
    const ctx = loadSw();
    ctx.setFetch(async () => redirected(htmlRes('login'), `${ORIGIN}/login?next=/my-store`));
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__PERSONAL);
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/my-store`), cache, undefined, ctx.sb.self.__PERSONAL);
    expect((await cache.keys()).length).toBe(0);
  });

  it('refuses cross-origin redirects and redirects INTO protected pages in the public cache', async () => {
    const ctx = loadSw();
    ctx.setFetch(async () => redirected(htmlRes('x'), 'https://evil.example.org/p'));
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__STATIC);
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/promo`), cache);
    expect((await cache.keys()).length).toBe(0);
    ctx.setFetch(async () => redirected(htmlRes('x'), `${ORIGIN}/settings`));
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/promo`), cache);
    expect((await cache.keys()).length).toBe(0);
  });
});

describe('sw.js — failed shell saves are retried (FIX SHELL-RETRY-01)', () => {
  const PENDING = `${ORIGIN}/__sw-pending-shells`;

  it('records a pending entry, tells the client, and saves on retry', async () => {
    const ctx = loadSw();
    let assetOk = false;
    ctx.setFetch(async (i) => {
      const p = pathOf(i);
      if (p === '/products') return htmlRes('products', ['/_next/static/p.js']);
      if (p === '/_next/static/p.js') { if (!assetOk) throw new TypeError('down'); return jsRes(); }
      throw new TypeError('unexpected');
    });
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__STATIC);
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/products`), cache);
    expect(await ctx.has(ctx.sb.self.__STATIC, `${ORIGIN}/products`)).toBe(false); // all-or-nothing kept
    const meta = await ctx.fakeCaches.open(ctx.sb.self.__META);
    expect(await meta.match(PENDING)).toBeTruthy();
    expect(ctx.messages.some((m) => m.type === 'SHELL_CACHE_RESULT' && m.status === 'pending' && m.pathname === '/products')).toBe(true);

    assetOk = true;
    await ctx.sb.retryPendingShells();
    expect(await ctx.has(ctx.sb.self.__STATIC, `${ORIGIN}/products`)).toBe(true);
    expect(await ctx.has(ctx.sb.self.__STATIC, `${ORIGIN}/_next/static/p.js`)).toBe(true);
    expect(await meta.match(PENDING)).toBeUndefined();
    expect(ctx.messages.some((m) => m.status === 'saved')).toBe(true);
  });

  it('gives up after 5 failed attempts instead of retrying forever', async () => {
    const ctx = loadSw();
    ctx.setFetch(async (i) => {
      if (pathOf(i) === '/flaky') return htmlRes('flaky', ['/_next/static/f.js']);
      throw new TypeError('down');
    });
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__STATIC);
    for (let n = 0; n < 5; n += 1) await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/flaky`), cache);
    const meta = await ctx.fakeCaches.open(ctx.sb.self.__META);
    expect(await meta.match(PENDING)).toBeUndefined();
    expect(ctx.messages.some((m) => m.status === 'failed')).toBe(true);
  });

  it('does not burn attempts while the browser is offline', async () => {
    const ctx = loadSw({ onLine: false });
    ctx.setFetch(async (i) => {
      if (pathOf(i) === '/flaky') return htmlRes('flaky', ['/_next/static/f.js']);
      throw new TypeError('down');
    });
    const cache = await ctx.fakeCaches.open(ctx.sb.self.__STATIC);
    await ctx.sb.cacheVisitedDocumentShell(new URL(`${ORIGIN}/flaky`), cache);
    await ctx.sb.retryPendingShells();
    const meta = await ctx.fakeCaches.open(ctx.sb.self.__META);
    const stored = JSON.parse(await (await meta.match(PENDING)).text());
    expect(stored[0].attempts).toBe(1);
  });
});

describe('sw.js — shell migration across a CACHE_VERSION bump (FIX SHELL-MIGRATION-*)', () => {
  async function seed(ctx: ReturnType<typeof loadSw>) {
    const now = Date.now();
    const put = async (cacheName: string, url: string, body: string, type: string, ageDays: number, source = 'visit') => {
      const c = await ctx.fakeCaches.open(cacheName);
      await c.put(url, new Response(body, {
        status: 200,
        headers: { 'content-type': type, 'X-SW-Cached-At': String(now - ageDays * DAY), 'X-SW-Cache-Source': source },
      }));
    };
    const pg = (n: string, chunk = '/_next/static/c.js') => page(n, [chunk]);
    await put('market-static-v50', `${ORIGIN}/_next/static/c.js`, 'x', 'application/javascript', 20, 'visit-asset');
    await put('market-static-v50', `${ORIGIN}/about`, pg('about'), 'text/html', 20);
    await put('market-static-v50', `${ORIGIN}/fresh`, pg('fresh'), 'text/html', 2);
    await put('market-static-v50', `${ORIGIN}/ancient`, pg('ancient'), 'text/html', 60);
    await put('market-static-v50', `${ORIGIN}/nochunk`, pg('nochunk', '/_next/static/missing.js'), 'text/html', 3);
    await put('market-static-v50', `${ORIGIN}/admin/users`, pg('admin'), 'text/html', 1);
    await put('market-static-v50', `${ORIGIN}/login`, pg('login'), 'text/html', 1);
    for (let n = 0; n < 50; n += 1) await put('market-static-v50', `${ORIGIN}/p${n}`, pg(`p${n}`), 'text/html', 10 + n * 0.2);
    await put('market-personal-shell-v50', `${ORIGIN}/settings`, pg('settings'), 'text/html', 40, 'warm');
    await put('market-personal-shell-v50', `${ORIGIN}/my-ads`, pg('my-ads'), 'text/html', 12);
    await put('market-personal-shell-v50', `${ORIGIN}/my-ads/old`, pg('old'), 'text/html', 50);
  }

  it('keeps recent visited pages (with their old chunks) and drops unsafe/ancient/broken ones', async () => {
    const ctx = loadSw();
    await seed(ctx);
    await ctx.sb.migrateShellCaches(await ctx.fakeCaches.keys());
    const S = ctx.sb.self.__STATIC;
    expect(await ctx.has(S, `${ORIGIN}/fresh`)).toBe(true);
    expect(await ctx.has(S, `${ORIGIN}/about`)).toBe(true); // 20d old: kept as a recent visit
    expect(await ctx.has(S, `${ORIGIN}/_next/static/c.js`)).toBe(true); // its chunk travels with it
    expect(await ctx.has(S, `${ORIGIN}/ancient`)).toBe(false);
    expect(await ctx.has(S, `${ORIGIN}/nochunk`)).toBe(false);
    expect(await ctx.has(S, `${ORIGIN}/admin/users`)).toBe(false);
    expect(await ctx.has(S, `${ORIGIN}/login`)).toBe(false);
    const kept = (await (await ctx.fakeCaches.open(S)).keys()).filter((k: any) => /\/p\d+$/.test(k.url));
    expect(kept.length).toBe(40);
  });

  it('migrates personal shells (pinned and recently visited) — previously never migrated', async () => {
    const ctx = loadSw();
    await seed(ctx);
    await ctx.sb.migrateShellCaches(await ctx.fakeCaches.keys());
    const P = ctx.sb.self.__PERSONAL;
    expect(await ctx.has(P, `${ORIGIN}/settings`)).toBe(true);
    expect(await ctx.has(P, `${ORIGIN}/my-ads`)).toBe(true);
    expect(await ctx.has(P, `${ORIGIN}/my-ads/old`)).toBe(false);
  });
});

describe('sw.js — stale public API snapshot grace (FIX API-STALE-GRACE-01)', () => {
  const url = `${ORIGIN}/api/v1/ads?page=1`;
  async function run(ageHours: number) {
    const ctx = loadSw();
    const c = await ctx.fakeCaches.open(ctx.sb.self.__API);
    await c.put(url, new Response(JSON.stringify({ items: [1] }), {
      status: 200,
      headers: {
        'content-type': 'application/json', 'cache-control': 'public, max-age=60',
        'X-SW-Cached-At': String(Date.now() - ageHours * 3_600_000),
      },
    }));
    ctx.setFetch(async () => { throw new TypeError('offline'); });
    const req = { url, method: 'GET', headers: new Headers(), mode: 'cors', clone() { return this; } };
    const res = await ctx.sb.networkFirstApi({ waitUntil() {} }, req, new URL(url));
    return { ctx, res };
  }

  it('serves a fresh snapshot without the stale flag', async () => {
    const { res } = await run(2);
    expect(res.ok).toBe(true);
    expect(res.headers.get('X-SW-Stale')).toBeNull();
  });

  it('serves a snapshot past the hard TTL with X-SW-Stale and notifies the client', async () => {
    const { res, ctx } = await run(48);
    expect(res.ok).toBe(true);
    expect(res.headers.get('X-SW-Stale')).toBe('1');
    expect(ctx.messages.some((m) => m.type === 'STALE_API_SERVED')).toBe(true);
  });

  it('still deletes snapshots older than the grace window', async () => {
    const { res, ctx } = await run(24 * 10);
    expect(res.ok).toBeFalsy();
    expect(await ctx.has(ctx.sb.self.__API, url)).toBe(false);
  });
});
