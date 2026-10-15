/**
 * __tests__/unit/lib/offlineRouteShells.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmRouteShells, warmPersonalShells, inspectRouteCache, isPermanentShellRoute, CORE_ROUTES } from '@/lib/offlineRouteShells';

describe('permanent route-shell policy', () => {
  it('pins stable public shells but not frequently changing public hubs', () => {
    expect(isPermanentShellRoute('/offline')).toBe(true);
    expect(isPermanentShellRoute('/privacy')).toBe(true);
    expect(isPermanentShellRoute('/about')).toBe(true);
    expect(isPermanentShellRoute('/products')).toBe(false);
    expect(isPermanentShellRoute('/stores')).toBe(false);
  });

  it('pins create forms but not record-specific edit pages', () => {
    expect(isPermanentShellRoute('/ads/create', true)).toBe(true);
    expect(isPermanentShellRoute('/my-store/products/new', true)).toBe(true);
    expect(isPermanentShellRoute('/my-services/new', true)).toBe(true);
    expect(isPermanentShellRoute('/requests/new', true)).toBe(true);
    expect(isPermanentShellRoute('/my-store/products/123/edit', true)).toBe(false);
    expect(isPermanentShellRoute('/my-ads/123/edit', true)).toBe(false);
  });
});

describe('offlineRouteShells', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'caches',
      {
        open: vi.fn(async () => ({
          put: vi.fn(async () => undefined),
          match: vi.fn(async () => undefined),
        })),
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html/>', { status: 200 })),
    );
  });

  it('warmRouteShells opens cache and fetches core routes', async () => {
    await warmRouteShells();
    expect(caches.open).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
  });

  it('does not throw when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(warmRouteShells()).resolves.toBeUndefined();
  });

  // OFFLINE-HUB-01: /saved-ads and /downloads became tabs of '/offline'.
  // /saved-payments remains a public shell backed only by local device data.
  it('keeps the local-only saved payments page eligible for public warming', () => {
    expect(CORE_ROUTES).toContain('/saved-payments');
  });

  it('warms core offline hub routes (not redirect stubs)', async () => {
    // Use the full plan so this assertion tests route eligibility, not the
    // smaller default fast-tier budget.
    localStorage.setItem('marketplat:warming-pref', 'full');
    // 'full' only widens the adaptive route budget on a normal/fast link; with
    // no navigator.connection the tier is 'unknown' (8 routes), which is
    // consumed by the protected baseline tranche before '/saved-payments'.
    vi.stubGlobal('navigator', {
      onLine: true,
      connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false },
    });
    const fetchedPaths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        fetchedPaths.push(typeof input === 'string' ? input : String(input));
        return new Response('<html/>', { status: 200 });
      }),
    );

    await warmRouteShells();

    expect(fetchedPaths).toContain('/offline');
    expect(fetchedPaths).toContain('/saved-payments');
    expect(fetchedPaths).not.toContain('/saved-ads');
    expect(fetchedPaths).not.toContain('/downloads');
  });

  it('warmPersonalShells opens personal shell cache when online', async () => {
    await warmPersonalShells();
    expect(caches.open).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
  });

  it('warmPersonalShells is a no-op when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(warmPersonalShells()).resolves.toBeUndefined();
  });

  describe('inspectRouteCache — actual cache truth', () => {
    it('does not report complete when the HTML document is absent', async () => {
      const cache = { match: vi.fn(async () => undefined) };
      vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
      const result = await inspectRouteCache('/products');
      expect(result.htmlPresent).toBe(false);
      expect(result.complete).toBe(false);
    });

    it('does not report complete when HTML has no verifiable JS/CSS assets', async () => {
      const cache = {
        match: vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input), 'https://example.test');
          if (url.pathname === '/products') {
            return new Response('<html><body>shell</body></html>', {
              headers: { 'content-type': 'text/html' },
            });
          }
          return undefined;
        }),
      };
      vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
      const result = await inspectRouteCache('/products');
      expect(result.htmlPresent).toBe(true);
      expect(result.complete).toBe(false);
    });

    it('reports complete only when the HTML and its referenced asset are present', async () => {
      const cache = {
        match: vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input), 'https://example.test');
          if (url.pathname === '/products') {
            return new Response('<html><script src="/_next/static/chunks/app.js"></script></html>', {
              headers: { 'content-type': 'text/html' },
            });
          }
          if (url.pathname === '/_next/static/chunks/app.js') {
            return new Response('console.log(1)', {
              headers: { 'content-type': 'application/javascript' },
            });
          }
          return undefined;
        }),
      };
      vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
      const result = await inspectRouteCache('/products');
      expect(result.htmlPresent).toBe(true);
      expect(result.complete).toBe(true);
      expect(result.checkedAssets).toBe(1);
    });
  });

});
