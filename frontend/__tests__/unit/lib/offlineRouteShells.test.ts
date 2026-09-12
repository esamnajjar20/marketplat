/**
 * __tests__/unit/lib/offlineRouteShells.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmRouteShells, warmPersonalShells } from '@/lib/offlineRouteShells';

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

  // FIX OFFLINE-SELF-LINKS-01: /offline itself links to these three routes
  // as "available on this device without internet" — they must actually be
  // pre-warmed or that promise is false on a fresh offline hard navigation.
  it('warms the routes /offline itself promises are available offline', async () => {
    const fetchedPaths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        fetchedPaths.push(typeof input === 'string' ? input : String(input));
        return new Response('<html/>', { status: 200 });
      }),
    );

    await warmRouteShells();

    for (const path of ['/saved-ads', '/downloads', '/saved-payments']) {
      expect(fetchedPaths).toContain(path);
    }
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
});
