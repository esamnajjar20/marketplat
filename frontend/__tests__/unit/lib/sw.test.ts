/**
 * __tests__/unit/lib/sw.test.ts
 *
 * public/sw.js is a raw service-worker script (not an ES module — it
 * relies on `self`, `caches`, `fetch`, `indexedDB` as ambient globals),
 * so it can't be `import`-ed directly like the rest of the codebase.
 * This harness loads the script's source with `vm.runInNewContext`
 * against a minimal fake `self`/`caches`/`indexedDB` sandbox, then
 * exercises the pure helper functions and event listeners it registers.
 *
 * This closes audit item #6 ("no SW logic tests, no offline tests")
 * for the SW file itself, and locks in fixes from the original audit
 * so they can't silently regress:
 *   - #2 (Critical): CLEAR_API_CACHE message listener must actually
 *     purge API_CACHE — this is the fix for the shared-device logout
 *     cache-leak.
 *   - #7 (Medium): protected/admin page navigations must never be
 *     read from or written to STATIC_CACHE.
 *
 * FIX SW-TEST-COVERAGE-01: this file originally stopped there — every
 * fetch strategy, the offline mutation queue, replay, and (most
 * critically) the 401-refresh-and-retry path in replayOne had never
 * been exercised by any test, not even in a sandbox (sw.js's own top
 * comment admitted this explicitly). That's the single most complex
 * piece of logic in the file — token refresh racing against a queued
 * request during a real network outage — and it had zero coverage.
 * This extends the harness with a minimal but behaviorally-real
 * IndexedDB fake (Node's built-in Response/Headers/Blob/URL are used
 * as-is; only indexedDB has no Node equivalent) so that logic can
 * actually run and be locked in against regression.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const SW_SOURCE = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');

// ── minimal spec-shaped IndexedDB fake ──────────────────────────────
// Only supports exactly what sw.js's openQueueDb/queueRequestEntry/
// getAllQueuedEntries/getQueuedEntry/deleteQueuedEntry/markQueuedEntry
// use: a single object store, keyPath 'id', autoIncrement, and
// add/get/getAll/delete/put + transaction oncomplete/onerror. Real
// IDBRequest.onsuccess and IDBTransaction.oncomplete fire asynchronously
// (never synchronously within the call that created them) — this fake
// mirrors that with real `queueMicrotask` so ordering bugs in sw.js
// itself would actually surface here, instead of everything being
// hand-waved synchronous.
function createFakeIndexedDB() {
  type DbState = { data: Map<number, any>; nextId: number; hasStore: boolean };
  const dbs = new Map<string, DbState>();

  function dbState(name: string): DbState {
    if (!dbs.has(name)) dbs.set(name, { data: new Map(), nextId: 1, hasStore: false });
    return dbs.get(name)!;
  }

  function makeRequest(): any {
    return { onsuccess: null, onerror: null, result: undefined, error: undefined };
  }

  function fireRequestSuccess(req: any, result: unknown) {
    req.result = result;
    queueMicrotask(() => {
      if (req.onsuccess) req.onsuccess({ target: req });
    });
  }

  function makeTransaction(state: DbState) {
    const tx: any = { oncomplete: null, onerror: null, error: null };
    const store = {
      add: (record: any) => {
        const id = state.nextId++;
        state.data.set(id, { ...record, id });
        const req = makeRequest();
        fireRequestSuccess(req, id);
        return req;
      },
      get: (id: number) => {
        const req = makeRequest();
        fireRequestSuccess(req, state.data.get(id));
        return req;
      },
      getAll: () => {
        const req = makeRequest();
        fireRequestSuccess(req, Array.from(state.data.values()));
        return req;
      },
      delete: (id: number) => {
        state.data.delete(id);
        const req = makeRequest();
        fireRequestSuccess(req, undefined);
        return req;
      },
      put: (record: any) => {
        state.data.set(record.id, record);
        const req = makeRequest();
        fireRequestSuccess(req, record.id);
        return req;
      },
    };
    // 3 nested queueMicrotask hops: comfortable margin over the deepest
    // chain sw.js actually issues within one transaction (markQueuedEntry's
    // get→onsuccess→put→assign-oncomplete is 1 hop) without needing a
    // full "count pending requests" tracker for this deliberately small
    // fake.
    queueMicrotask(() =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          if (tx.oncomplete) tx.oncomplete();
        }),
      ),
    );
    return {
      objectStore: () => store,
      get oncomplete() {
        return tx.oncomplete;
      },
      set oncomplete(fn: any) {
        tx.oncomplete = fn;
      },
      get onerror() {
        return tx.onerror;
      },
      set onerror(fn: any) {
        tx.onerror = fn;
      },
      get error() {
        return tx.error;
      },
    };
  }

  return {
    open(name: string, _version: number) {
      const state = dbState(name);
      const req: any = { onupgradeneeded: null, onsuccess: null, onerror: null, result: undefined };
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: (n: string) => state.hasStore && n === 'requests' },
          createObjectStore: (_n: string) => {
            state.hasStore = true;
            return {};
          },
          transaction: (_storeName: string, _mode: string) => makeTransaction(state),
        };
        req.result = db;
        if (!state.hasStore && req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };
}

// ── minimal Request-shaped fixture ──────────────────────────────────
// Real Node `Request` has no `destination`/`mode` (browser-only fetch
// fields), so a plain object matching exactly the surface sw.js reads
// (`.url`, `.method`, `.headers`, `.mode`, `.destination`, `.clone()`,
// `.blob()`) is more honest than fighting a real Request instance.
function makeFakeRequest(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  mode?: string;
  destination?: string;
  body?: string;
}) {
  const build = (): any => ({
    url: opts.url,
    method: opts.method || 'GET',
    headers: new Headers(opts.headers || {}),
    mode: opts.mode,
    destination: opts.destination,
    clone: () => build(),
    blob: async () => new Blob([opts.body ?? '']),
  });
  return build();
}

function makeEvent() {
  const waits: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => {
      waits.push(p);
    },
    _waits: waits,
  };
}

function loadServiceWorker() {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  const storesByName = new Map<string, Map<string, any>>();

  const fakeCaches = {
    open: async (name: string) => {
      if (!storesByName.has(name)) storesByName.set(name, new Map());
      const store = storesByName.get(name)!;
      return {
        match: async (req: any) => store.get(typeof req === 'string' ? req : req.url),
        put: async (req: any, res: any) => {
          store.set(typeof req === 'string' ? req : req.url, res);
        },
        delete: async (req: any) => store.delete(typeof req === 'string' ? req : req.url),
        keys: async () => Array.from(store.keys()).map((url) => ({ url })),
      };
    },
    delete: async (name: string) => storesByName.delete(name),
    keys: async () => Array.from(storesByName.keys()),
    match: async () => undefined,
  };

  let currentFetch: (input: any, init?: any) => Promise<Response> = async () => {
    throw new Error('sw.test.ts: no fetch configured for this test — call ctx.setFetch(...) first');
  };

  const sandbox: Record<string, any> = {
    self: {
      addEventListener: (type: string, handler: (event: any) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined, matchAll: async () => [] },
      registration: {},
      location: { origin: 'https://example.com' },
    },
    caches: fakeCaches,
    fetch: (...args: any[]) => currentFetch(args[0], args[1]),
    indexedDB: createFakeIndexedDB(),
    console,
    URL,
    Headers,
    Blob,
    Response,
    queueMicrotask,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  // NOTE: top-level `const`/`let` declarations inside a script run via
  // vm.runInContext do NOT become properties of the sandbox object
  // (only `var`/`function` declarations do) — so sw.js's
  // `const API_CACHE = ...` is invisible as `sandbox.API_CACHE` even
  // though `function isProtectedPage(){...}` IS visible as
  // `sandbox.isProtectedPage`. We bridge the consts we need to assert
  // against onto `self` with a follow-up statement appended to the
  // same execution, since sw.js itself is read-only source we don't
  // want to modify just for testability.
  vm.runInContext(
    `${SW_SOURCE}\nself.__API_CACHE = API_CACHE;\nself.__PERSONAL_SHELL_CACHE = PERSONAL_SHELL_CACHE;`,
    sandbox,
    { filename: 'sw.js' },
  );

  return {
    sandbox,
    listeners,
    storesByName,
    fakeCaches,
    setFetch: (fn: (input: any, init?: any) => Promise<Response>) => {
      currentFetch = fn;
    },
  };
}

describe('sw.js — service worker logic', () => {
  let ctx: ReturnType<typeof loadServiceWorker>;

  beforeEach(() => {
    ctx = loadServiceWorker();
  });

  describe('isProtectedPage (audit #7 — protected/admin navigate exclusion)', () => {
    const isProtectedPage = () => ctx.sandbox.isProtectedPage;

    it('flags dashboard, settings, my-ads, my-services, my-store, favorites, messages, notifications, ads/create, and admin as protected', () => {
      const paths = [
        '/dashboard',
        '/settings',
        '/settings/seller',
        '/my-ads',
        '/my-services',
        '/my-services/123/edit',
        // REGRESSION (FIX OFFLINE-CREATE-PAGES-01): '/my-store' was
        // missing from protectedPrefixes entirely — every /my-store/*
        // page shell was falling through to the shared, never-cleared
        // STATIC_CACHE via networkFirstPage instead of the isolated
        // PERSONAL_SHELL_CACHE, in direct violation of audit #7's own
        // documented policy (same bug class as FIX PWA-NOTIF-01 above,
        // just for the store owner's dashboard instead of notifications).
        '/my-store',
        '/my-store/products/new',
        '/favorites',
        '/messages',
        '/notifications',
        '/ads/create',
        '/admin',
        '/admin/sellers',
      ];
      for (const pathname of paths) {
        expect(isProtectedPage()(new URL(`https://example.com${pathname}`))).toBe(true);
      }
    });

    it('does not flag public pages', () => {
      const paths = ['/', '/ads/123', '/sellers/abc', '/login', '/register'];
      for (const pathname of paths) {
        expect(isProtectedPage()(new URL(`https://example.com${pathname}`))).toBe(false);
      }
    });
  });

  describe('isNeverCache (auth/csrf exclusion)', () => {
    it('never caches /auth/ and /csrf paths', () => {
      const isNeverCache = ctx.sandbox.isNeverCache;
      expect(isNeverCache(new URL('https://example.com/api/auth/login'))).toBe(true);
      expect(isNeverCache(new URL('https://example.com/api/csrf'))).toBe(true);
      expect(isNeverCache(new URL('https://example.com/api/sellers/me/profile'))).toBe(false);
    });
  });

  describe('isPersonalShellRoute (FEAT-OFFLINE-MSG + FIX PWA-NOTIF-01 — narrow shell-cache exception within the protected-page set)', () => {
    it('matches every route on sw.js\'s own exact + prefix list (messages, notifications, dashboard, favorites, my-ads, saved-searches, activity, settings*, my-store*, my-services*, service-broadcasts*, my-requests*, profile/:id)', () => {
      const isPersonalShellRoute = ctx.sandbox.isPersonalShellRoute;
      const paths = [
        '/messages',
        '/messages/abc123',
        '/notifications',
        '/dashboard',
        '/favorites',
        '/my-ads',
        '/my-ads/123/edit',
        '/saved-searches',
        '/activity',
        // FIX OFFLINE-AD-CREATE-01
        '/ads/create',
        '/settings',
        '/settings/seller',
        '/my-store',
        '/my-store/inventory',
        '/my-services',
        '/my-services/123/edit',
        '/service-broadcasts',
        '/service-broadcasts/quotes',
        '/my-requests',
        '/my-requests/1',
        '/profile/some-user-id',
      ];
      for (const pathname of paths) {
        expect(isPersonalShellRoute(new URL(`https://example.com${pathname}`))).toBe(true);
      }
    });

    it('never matches /admin — deliberately excluded even though it is protected (sw.js\'s own comment: "لا يشمل /admin أبدًا")', () => {
      const isPersonalShellRoute = ctx.sandbox.isPersonalShellRoute;
      expect(isPersonalShellRoute(new URL('https://example.com/admin'))).toBe(false);
      expect(isPersonalShellRoute(new URL('https://example.com/admin/sellers'))).toBe(false);
    });

    it('does not match public pages', () => {
      const isPersonalShellRoute = ctx.sandbox.isPersonalShellRoute;
      expect(isPersonalShellRoute(new URL('https://example.com/'))).toBe(false);
      expect(isPersonalShellRoute(new URL('https://example.com/ads/123'))).toBe(false);
      expect(isPersonalShellRoute(new URL('https://example.com/login'))).toBe(false);
    });
  });

  describe('isApiRequest', () => {
    it('matches any /api/ path regardless of origin', () => {
      const isApiRequest = ctx.sandbox.isApiRequest;
      expect(isApiRequest(new URL('https://api.example.com/api/service-requests/me'))).toBe(true);
      expect(isApiRequest(new URL('https://example.com/dashboard'))).toBe(false);
    });
  });

  describe('CLEAR_API_CACHE message listener (audit #2 — logout cache leak fix)', () => {
    it('registers a message listener that deletes API_CACHE and PERSONAL_SHELL_CACHE on CLEAR_API_CACHE', async () => {
      const messageHandlers = ctx.listeners['message'] ?? [];
      expect(messageHandlers.length).toBeGreaterThan(0);

      const apiCacheName = ctx.sandbox.self.__API_CACHE;
      const shellCacheName = ctx.sandbox.self.__PERSONAL_SHELL_CACHE;
      expect(apiCacheName).toMatch(/market-api-/);
      expect(shellCacheName).toMatch(/market-personal-shell-/);
      await ctx.fakeCaches.open(apiCacheName);
      await ctx.fakeCaches.open(shellCacheName);
      expect(await ctx.fakeCaches.keys()).toContain(apiCacheName);
      expect(await ctx.fakeCaches.keys()).toContain(shellCacheName);

      const waitUntilCalls: Promise<unknown>[] = [];
      const fakeEvent = {
        data: { type: 'CLEAR_API_CACHE' },
        waitUntil: (p: Promise<unknown>) => waitUntilCalls.push(p),
      };

      for (const handler of messageHandlers) handler(fakeEvent);
      await Promise.all(waitUntilCalls);

      expect(await ctx.fakeCaches.keys()).not.toContain(apiCacheName);
      expect(await ctx.fakeCaches.keys()).not.toContain(shellCacheName);
    });

    it('ignores unrelated message types without touching any cache', async () => {
      const messageHandlers = ctx.listeners['message'] ?? [];
      const apiCacheName = ctx.sandbox.self.__API_CACHE;
      await ctx.fakeCaches.open(apiCacheName);

      const waitUntilCalls: Promise<unknown>[] = [];
      const fakeEvent = {
        data: { type: 'SOME_OTHER_MESSAGE' },
        waitUntil: (p: Promise<unknown>) => waitUntilCalls.push(p),
      };

      for (const handler of messageHandlers) handler(fakeEvent);
      await Promise.all(waitUntilCalls);

      expect(await ctx.fakeCaches.keys()).toContain(apiCacheName);
    });
  });

  describe('trimCache (FIX SW-TRIM-ORDER-01 — explicit X-SW-Cached-At order, not caches.keys() order)', () => {
    it('evicts the oldest entries by timestamp regardless of insertion order', async () => {
      const cache = await ctx.fakeCaches.open('test-trim-cache');
      // Insertion order (b, a, c) deliberately does NOT match timestamp
      // order (a=100, b=200, c=300) — the old implementation trusted
      // caches.keys() order and would have evicted "b" (first inserted)
      // instead of "a" (actually oldest by timestamp).
      await cache.put('https://x/b', new Response('b', { headers: { 'X-SW-Cached-At': '200' } }));
      await cache.put('https://x/a', new Response('a', { headers: { 'X-SW-Cached-At': '100' } }));
      await cache.put('https://x/c', new Response('c', { headers: { 'X-SW-Cached-At': '300' } }));

      await ctx.sandbox.trimCache('test-trim-cache', 2);

      const remaining = (await cache.keys()).map((k: any) => k.url).sort();
      expect(remaining).toEqual(['https://x/b', 'https://x/c']);
    });

    it('does nothing when already under the limit', async () => {
      const cache = await ctx.fakeCaches.open('test-trim-cache-2');
      await cache.put('https://x/a', new Response('a', { headers: { 'X-SW-Cached-At': '1' } }));
      await ctx.sandbox.trimCache('test-trim-cache-2', 5);
      expect((await cache.keys()).length).toBe(1);
    });

    it('treats an entry with no timestamp header as oldest (defensive default)', async () => {
      const cache = await ctx.fakeCaches.open('test-trim-cache-3');
      await cache.put('https://x/untimestamped', new Response('u'));
      await cache.put('https://x/fresh', new Response('f', { headers: { 'X-SW-Cached-At': '999' } }));

      await ctx.sandbox.trimCache('test-trim-cache-3', 1);

      const remaining = (await cache.keys()).map((k: any) => k.url);
      expect(remaining).toEqual(['https://x/fresh']);
    });
  });

  describe('networkFirstApi (writes via putTimestamped so trimCache has real data to sort by)', () => {
    it('stamps cached API responses with X-SW-Cached-At on a successful JSON response', async () => {
      ctx.setFetch(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const event = makeEvent();
      const request = makeFakeRequest({ url: 'https://example.com/api/v1/categories' });
      const url = new URL(request.url);

      await ctx.sandbox.networkFirstApi(event, request, url);
      await Promise.all(event._waits);

      const cache = await ctx.fakeCaches.open(ctx.sandbox.self.__API_CACHE);
      const cached = await cache.match(request);
      expect(cached).toBeDefined();
      expect(cached.headers.get('X-SW-Cached-At')).toMatch(/^\d+$/);
    });

    it('does not cache a non-JSON 200 response (FIX SW-CAPTIVE-01 API variant)', async () => {
      ctx.setFetch(async () => new Response('<html>captive portal</html>', { status: 200 }));
      const event = makeEvent();
      const request = makeFakeRequest({ url: 'https://example.com/api/v1/categories' });
      const url = new URL(request.url);

      await ctx.sandbox.networkFirstApi(event, request, url);
      await Promise.all(event._waits);

      const cache = await ctx.fakeCaches.open(ctx.sandbox.self.__API_CACHE);
      expect(await cache.match(request)).toBeUndefined();
    });
  });

  describe('handleMutation (offline queueing)', () => {
    it('passes the network response straight through when the network succeeds', async () => {
      const okResponse = new Response('{"ok":true}', { status: 200 });
      ctx.setFetch(async () => okResponse);
      const request = makeFakeRequest({ url: 'https://example.com/api/v1/favorites', method: 'POST' });

      const result = await ctx.sandbox.handleMutation(request);
      expect(result).toBe(okResponse);
    });

    it('queues the request in IndexedDB and returns 202 when the network fails, preserving the body as a Blob (FIX OFFLINE-ADS-01)', async () => {
      ctx.setFetch(async () => {
        throw new TypeError('network error');
      });
      const request = makeFakeRequest({
        url: 'https://example.com/api/v1/ads',
        method: 'POST',
        headers: { authorization: 'Bearer tok123', 'content-type': 'application/json' },
        body: '{"title":"test"}',
      });

      const result = await ctx.sandbox.handleMutation(request);
      expect(result.status).toBe(202);
      const payload = await result.clone().json();
      expect(payload.queued).toBe(true);

      const entries = await ctx.sandbox.getAllQueuedEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('pending');
      expect(entries[0].method).toBe('POST');
      expect(entries[0].headers.authorization).toBe('Bearer tok123');
      expect(entries[0].body).toBeInstanceOf(Blob);
    });

    it('links a queued entry to its offline-op-id when the request carries X-Offline-Op-Id (FIX AD-DRAFT-QUEUE-LINK-01)', async () => {
      ctx.setFetch(async () => {
        throw new TypeError('network error');
      });
      const request = makeFakeRequest({
        url: 'https://example.com/api/v1/ads',
        method: 'POST',
        headers: { 'x-offline-op-id': 'draft-abc-123' },
      });

      await ctx.sandbox.handleMutation(request);
      const [entry] = await ctx.sandbox.getAllQueuedEntries();
      expect(entry.operationId).toBe('draft-abc-123');
    });
  });

  describe('refreshAccessToken', () => {
    it('returns the new access + csrf token on success', async () => {
      ctx.setFetch(async () =>
        new Response(
          JSON.stringify({ data: { tokens: { accessToken: 'abc' }, csrfToken: 'csrf1' } }),
          { status: 200 },
        ),
      );
      const result = await ctx.sandbox.refreshAccessToken('https://example.com/api/v1/messages');
      // Field-by-field on purpose, not `.toEqual({...})`: this object is
      // constructed by sw.js code running in a separate vm realm, and a
      // strict deep-equal against a plain literal from this file's realm
      // can trip on prototype identity depending on the equality checker
      // — asserting the fields directly sidesteps that entirely.
      expect(result?.accessToken).toBe('abc');
      expect(result?.csrfToken).toBe('csrf1');
    });

    it('returns null when the refresh endpoint itself fails (expired session, not just an expired access token)', async () => {
      ctx.setFetch(async () => new Response('', { status: 401 }));
      const result = await ctx.sandbox.refreshAccessToken('https://example.com/api/v1/messages');
      expect(result).toBeNull();
    });

    it('returns null for a malformed sample URL instead of throwing', async () => {
      const result = await ctx.sandbox.refreshAccessToken('not-a-url');
      expect(result).toBeNull();
    });
  });

  describe('replayOne (queue-replay decision logic)', () => {
    async function seedOne(overrides: Record<string, unknown> = {}) {
      await ctx.sandbox.queueRequestEntry({
        url: 'https://example.com/api/v1/x',
        method: 'POST',
        headers: {},
        body: null,
        queuedAt: Date.now(),
        operationId: null,
        ...overrides,
      });
      const [entry] = await ctx.sandbox.getAllQueuedEntries();
      return entry;
    }

    it('removes the entry and returns "sent" on success', async () => {
      const entry = await seedOne();
      ctx.setFetch(async () => new Response('{}', { status: 200 }));

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('sent');
      expect(await ctx.sandbox.getAllQueuedEntries()).toHaveLength(0);
    });

    it('marks a non-401 4xx as "failed" and keeps it queued with the error, instead of silently dropping it (FIX CONFLICT-01)', async () => {
      const entry = await seedOne();
      ctx.setFetch(async () => new Response(JSON.stringify({ message: 'blocked' }), { status: 403 }));

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('failed');
      const [updated] = await ctx.sandbox.getAllQueuedEntries();
      expect(updated.status).toBe('failed');
      // Field-by-field for the same cross-realm reason as refreshAccessToken
      // above — lastError is a plain object literal built inside sw.js's
      // vm sandbox, not this file's realm.
      expect(updated.lastError?.status).toBe(403);
      expect(updated.lastError?.message).toBe('blocked');
    });

    it('leaves a 5xx pending (real failure to distinguish from a rejected request) and returns "still-offline"', async () => {
      const entry = await seedOne();
      ctx.setFetch(async () => new Response('oops', { status: 503 }));

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('still-offline');
      const [unchanged] = await ctx.sandbox.getAllQueuedEntries();
      expect(unchanged.status).toBe('pending');
    });

    it('returns "still-offline" and leaves the entry pending on an actual network failure', async () => {
      const entry = await seedOne();
      ctx.setFetch(async () => {
        throw new TypeError('network error');
      });

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('still-offline');
      const [unchanged] = await ctx.sandbox.getAllQueuedEntries();
      expect(unchanged.status).toBe('pending');
    });

    it('on 401, refreshes the access token once and retries with it, succeeding without ever surfacing "failed" (FIX OFFLINE-AUTH-01)', async () => {
      const entry = await seedOne({
        headers: { authorization: 'Bearer expired', 'x-csrf-token': 'old-csrf' },
      });

      const seenAuthHeaders: Array<string | undefined> = [];
      ctx.setFetch(async (input: any, init: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/auth/refresh')) {
          return new Response(
            JSON.stringify({ data: { tokens: { accessToken: 'fresh-token' }, csrfToken: 'fresh-csrf' } }),
            { status: 200 },
          );
        }
        const authHeader = init?.headers?.authorization;
        seenAuthHeaders.push(authHeader);
        if (authHeader === 'Bearer expired') {
          return new Response('unauthorized', { status: 401 });
        }
        return new Response('{}', { status: 200 });
      });

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('sent');
      expect(seenAuthHeaders).toEqual(['Bearer expired', 'Bearer fresh-token']);
      expect(await ctx.sandbox.getAllQueuedEntries()).toHaveLength(0);
    });

    it('on 401 where the refresh itself also fails, falls through to a final "failed" (real expired session, not a design flaw)', async () => {
      const entry = await seedOne({ headers: { authorization: 'Bearer expired' } });

      ctx.setFetch(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/auth/refresh')) {
          return new Response('', { status: 401 }); // refresh token itself expired too
        }
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      });

      const result = await ctx.sandbox.replayOne(entry, false);

      expect(result).toBe('failed');
      const [updated] = await ctx.sandbox.getAllQueuedEntries();
      expect(updated.status).toBe('failed');
    });

    it('does not attempt a second refresh when hasRetriedAfterRefresh is already true', async () => {
      const entry = await seedOne({ headers: { authorization: 'Bearer still-expired' } });
      let refreshCalls = 0;
      ctx.setFetch(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/auth/refresh')) refreshCalls += 1;
        return new Response('unauthorized', { status: 401 });
      });

      const result = await ctx.sandbox.replayOne(entry, true);

      expect(result).toBe('failed');
      expect(refreshCalls).toBe(0);
    });
  });

  describe('replayQueue (ordering across multiple entries)', () => {
    it('does not let a failed 4xx block the rest of the queue, but a real network failure stops further processing (FIX CONFLICT-01)', async () => {
      await ctx.sandbox.queueRequestEntry({
        url: 'https://example.com/api/v1/a',
        method: 'POST',
        headers: {},
        body: null,
        queuedAt: 1,
        operationId: null,
      });
      await ctx.sandbox.queueRequestEntry({
        url: 'https://example.com/api/v1/b',
        method: 'POST',
        headers: {},
        body: null,
        queuedAt: 2,
        operationId: null,
      });
      await ctx.sandbox.queueRequestEntry({
        url: 'https://example.com/api/v1/c',
        method: 'POST',
        headers: {},
        body: null,
        queuedAt: 3,
        operationId: null,
      });

      ctx.setFetch(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/a')) return new Response(JSON.stringify({ message: 'bad' }), { status: 400 });
        if (url.endsWith('/b')) throw new TypeError('offline');
        return new Response('{}', { status: 200 }); // /c — should never actually be reached
      });

      await ctx.sandbox.replayQueue();

      const remaining = await ctx.sandbox.getAllQueuedEntries();
      const statusByPath = Object.fromEntries(
        remaining.map((e: any) => [new URL(e.url).pathname.split('/').pop(), e.status]),
      );
      expect(statusByPath.a).toBe('failed'); // 4xx: marked failed, did NOT block the queue
      expect(statusByPath.b).toBe('pending'); // still-offline: stayed pending, blocked the rest
      expect(statusByPath.c).toBe('pending'); // never attempted — queue stopped at "b"
    });

    it('skips entries already marked "failed" without retrying them', async () => {
      await ctx.sandbox.queueRequestEntry({
        url: 'https://example.com/api/v1/already-failed',
        method: 'POST',
        headers: {},
        body: null,
        queuedAt: 1,
        operationId: null,
        status: 'failed',
      });

      let fetchCalls = 0;
      ctx.setFetch(async () => {
        fetchCalls += 1;
        return new Response('{}', { status: 200 });
      });

      await ctx.sandbox.replayQueue();

      expect(fetchCalls).toBe(0);
    });
  });
});
