/**
 * __tests__/unit/lib/offlineRouteShells.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmRouteShells } from '@/lib/offlineRouteShells';

describe('offlineRouteShells', () => {
  beforeEach(() => {
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
});
