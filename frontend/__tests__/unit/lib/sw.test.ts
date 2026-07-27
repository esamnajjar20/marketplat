/**
 * __tests__/unit/lib/sw.test.ts
 *
 * public/sw.js is a raw service-worker script (not an ES module — it
 * relies on `self`, `caches`, `fetch`, `indexedDB` as ambient globals),
 * so it can't be `import`-ed directly like the rest of the codebase.
 * This harness loads the script's source with `vm.runInNewContext`
 * against a minimal fake `self`/`caches` sandbox, then exercises the
 * pure helper functions and event listeners it registers.
 *
 * This closes audit item #6 ("no SW logic tests, no offline tests")
 * for the SW file itself, and locks in the two SW-side fixes from the
 * original audit so they can't silently regress:
 *   - #2 (Critical): CLEAR_API_CACHE message listener must actually
 *     purge API_CACHE — this is the fix for the shared-device logout
 *     cache-leak.
 *   - #7 (Medium): protected/admin page navigations must never be
 *     read from or written to STATIC_CACHE.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const SW_SOURCE = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');

/**
 * Builds a fresh fake `self` scope, loads sw.js into it, and returns
 * both the scope (to inspect registered listeners / call helpers that
 * were assigned as globals) and a fakeCaches double to assert against.
 */
function loadServiceWorker() {
  const listeners: Record<string, Array<(event: any) => void>> = {};

  const storesByName = new Map<string, Map<string, unknown>>();

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

  const sandbox: Record<string, any> = {
    self: {
      addEventListener: (type: string, handler: (event: any) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined, matchAll: async () => [] },
      registration: {},
    },
    caches: fakeCaches,
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    indexedDB: { open: () => ({ addEventListener: () => undefined }) },
    console,
    Response: class {
      static error() {
        return { ok: false };
      }
      constructor(public body?: any, public init?: any) {}
    },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  // NOTE: top-level `const`/`let` declarations inside a script run via
  // vm.runInContext do NOT become properties of the sandbox object
  // (only `var`/`function` declarations do) — so sw.js's
  // `const API_CACHE = ...` is invisible as `sandbox.API_CACHE` even
  // though `function isProtectedPage(){...}` IS visible as
  // `sandbox.isProtectedPage`. We bridge the one const we need to
  // assert against (API_CACHE) onto `self` with a follow-up statement
  // appended to the same execution, since sw.js itself is read-only
  // source we don't want to modify just for testability.
  vm.runInContext(`${SW_SOURCE}\nself.__API_CACHE = API_CACHE;`, sandbox, {
    filename: 'sw.js',
  });

  return { sandbox, listeners, storesByName, fakeCaches };
}

describe('sw.js — service worker logic', () => {
  let ctx: ReturnType<typeof loadServiceWorker>;

  beforeEach(() => {
    ctx = loadServiceWorker();
  });

  describe('isProtectedPage (audit #7 — protected/admin navigate exclusion)', () => {
    const isProtectedPage = () => ctx.sandbox.isProtectedPage;

    it('flags dashboard, settings, my-ads, my-services, favorites, messages, ads/create, and admin as protected', () => {
      const paths = [
        '/dashboard',
        '/settings',
        '/settings/seller',
        '/my-ads',
        '/my-services',
        '/my-services/123/edit',
        '/favorites',
        '/messages',
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

  describe('isApiRequest', () => {
    it('matches any /api/ path regardless of origin', () => {
      const isApiRequest = ctx.sandbox.isApiRequest;
      expect(isApiRequest(new URL('https://api.example.com/api/service-requests/me'))).toBe(true);
      expect(isApiRequest(new URL('https://example.com/dashboard'))).toBe(false);
    });
  });

  describe('CLEAR_API_CACHE message listener (audit #2 — logout cache leak fix)', () => {
    it('registers a message listener that deletes API_CACHE on CLEAR_API_CACHE', async () => {
      const messageHandlers = ctx.listeners['message'] ?? [];
      expect(messageHandlers.length).toBeGreaterThan(0);

      // Seed the API cache so we can prove it actually gets removed.
      const apiCacheName = ctx.sandbox.self.__API_CACHE;
      expect(apiCacheName).toMatch(/market-api-/);
      await ctx.fakeCaches.open(apiCacheName);
      expect(await ctx.fakeCaches.keys()).toContain(apiCacheName);

      const waitUntilCalls: Promise<unknown>[] = [];
      const fakeEvent = {
        data: { type: 'CLEAR_API_CACHE' },
        waitUntil: (p: Promise<unknown>) => waitUntilCalls.push(p),
      };

      for (const handler of messageHandlers) handler(fakeEvent);
      await Promise.all(waitUntilCalls);

      expect(await ctx.fakeCaches.keys()).not.toContain(apiCacheName);
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
});
