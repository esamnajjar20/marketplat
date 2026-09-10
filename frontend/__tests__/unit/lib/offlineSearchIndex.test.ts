/**
 * __tests__/unit/lib/offlineSearchIndex.test.ts
 * loadOfflineIndex expects body.data as an ARRAY (not {items}).
 * cache.match URL must equal buildCoreUrls() urls exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchOffline } from '@/lib/offlineSearchIndex';

const PRODUCT_URL = 'https://api.example.com/products?page=1&sortBy=createdAt&sortOrder=desc&limit=12';
const STORE_URL = 'https://api.example.com/stores?page=1&sortBy=createdAt&sortOrder=desc';

vi.mock('@/lib/offlineCoreBundle', () => ({
  CORE_CACHE: 'market-core-v6',
  buildCoreUrls: () => [
    { key: 'products', url: PRODUCT_URL },
    { key: 'stores', url: STORE_URL },
  ],
}));

describe('searchOffline', () => {
  beforeEach(() => {
    vi.stubGlobal('caches', undefined);
  });

  it('returns empty with hasBundle=false when Cache API missing', async () => {
    const r = await searchOffline({ q: 'هاتف' });
    expect(r.items).toEqual([]);
    expect(r.hasBundle).toBe(false);
  });

  it('filters products from CORE_CACHE when present', async () => {
    // API shape: { data: Product[] }  — NOT { data: { items } }
    const productBody = {
      data: [
        {
          id: 'p1',
          name: 'هاتف سامسونج',
          description: 'جديد',
          images: ['https://img/1.jpg'],
          store: { id: 's1', name: 'متجر', city: 'غزة' },
          storeId: 's1',
          views: 10,
          price: '1000',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'p2',
          name: 'لابتوب',
          description: '',
          images: [],
          store: { id: 's1', name: 'متجر', city: 'رام الله' },
          storeId: 's1',
          views: 0,
          price: '2000',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };

    const match = vi.fn(async (req: RequestInfo) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      if (url === PRODUCT_URL || url.includes('/products')) {
        return new Response(JSON.stringify(productBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return undefined;
    });

    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match })),
    });

    const r = await searchOffline({ q: 'هاتف' });
    expect(r.hasBundle).toBe(true);
    expect(r.items.some((i) => i.title.includes('هاتف'))).toBe(true);
  });

  it('filters by type=products', async () => {
    const match = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'p1',
              name: 'منتج',
              images: [],
              store: { id: 's1', name: 'م', city: 'غزة' },
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match })),
    });
    const r = await searchOffline({ q: 'منتج', type: 'products' });
    expect(r.hasBundle).toBe(true);
    expect(r.items.every((i) => i.type === 'product')).toBe(true);
  });
});
