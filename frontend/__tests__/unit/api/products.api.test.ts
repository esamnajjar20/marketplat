/**
 * __tests__/unit/api/products.api.test.ts
 *
 * Coverage targets (same style as ads.api.test.ts's FormData
 * construction tests — products.create() has real branching logic,
 * not a thin wrapper, and none of it is exercised by hook tests that
 * mock the whole products.api module):
 *
 *  - create() FormData construction: scalars coerced to strings,
 *    optional fields (discountPrice/wholesalePrice/wholesaleMinQty/
 *    availability) omitted entirely when undefined, each image
 *    appended as a separate 'images' entry, multipart Content-Type
 *    header set
 *  - create()'s onUploadProgress wiring: the percent math and the
 *    "no callback → no onUploadProgress key at all" case
 *  - update() sends plain JSON (not FormData) with no images field
 *  - every other endpoint's exact path/method (regression guard
 *    against typos like '/products/mine' instead of '/products/me')
 *  - getAll / getMine correctly unwrap the paginated response shape
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productsApi } from '@/api/products.api';
import { apiClient } from '@/api/client';
import type { CreateProductPayload } from '@/types/product.types';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: {} } });
});

function makeFile(name: string): File {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' });
}

function makePayload(overrides: Partial<CreateProductPayload> = {}): CreateProductPayload {
  return {
    categoryId: 'cat-1',
    name: 'خلاط كهربائي',
    description: 'وصف طويل بما فيه الكفاية لتجاوز حد الأحرف الأدنى',
    price: 150,
    images: [makeFile('a.jpg')],
    ...overrides,
  };
}

describe('productsApi.create — FormData construction', () => {
  it('appends every scalar field, coercing numbers to strings', async () => {
    await productsApi.create(makePayload({ price: 199.5 }));

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('categoryId')).toBe('cat-1');
    expect(form.get('name')).toBe('خلاط كهربائي');
    expect(form.get('price')).toBe('199.5');
  });

  it('appends each file in images as a separate entry under the same key', async () => {
    await productsApi.create(makePayload({ images: [makeFile('a.jpg'), makeFile('b.jpg')] }));

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const entries = form.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('a.jpg');
    expect((entries[1] as File).name).toBe('b.jpg');
  });

  it('omits discountPrice/wholesalePrice/wholesaleMinQty/availability entirely when undefined', async () => {
    await productsApi.create(makePayload());

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.has('discountPrice')).toBe(false);
    expect(form.has('wholesalePrice')).toBe(false);
    expect(form.has('wholesaleMinQty')).toBe(false);
    expect(form.has('availability')).toBe(false);
  });

  it('includes discountPrice/wholesalePrice/wholesaleMinQty/availability when provided', async () => {
    await productsApi.create(makePayload({
      discountPrice: 120, wholesalePrice: 100, wholesaleMinQty: 10, availability: 'LIMITED',
    }));

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('discountPrice')).toBe('120');
    expect(form.get('wholesalePrice')).toBe('100');
    expect(form.get('wholesaleMinQty')).toBe('10');
    expect(form.get('availability')).toBe('LIMITED');
  });

  it('sets the multipart/form-data Content-Type header', async () => {
    await productsApi.create(makePayload());
    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('POSTs to /products', async () => {
    await productsApi.create(makePayload());
    expect(apiClient.post).toHaveBeenCalledWith('/products', expect.any(FormData), expect.any(Object));
  });

  it('does not set onUploadProgress in the config when no callback is passed', async () => {
    await productsApi.create(makePayload());
    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(config.onUploadProgress).toBeUndefined();
  });

  it('wires onUploadProgress to report a rounded percentage of loaded/total', async () => {
    const onProgress = vi.fn();
    await productsApi.create(makePayload(), onProgress);

    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(typeof config.onUploadProgress).toBe('function');

    config.onUploadProgress({ loaded: 50, total: 200 });
    expect(onProgress).toHaveBeenCalledWith(25);
  });

  it('reports 0 progress when the event has no total (upload length not known yet)', async () => {
    const onProgress = vi.fn();
    await productsApi.create(makePayload(), onProgress);

    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    config.onUploadProgress({ loaded: 50, total: 0 });
    expect(onProgress).toHaveBeenCalledWith(0);
  });
});

describe('productsApi.update — plain JSON, no images field', () => {
  it('PATCHes /products/:id with the JSON payload (not FormData)', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await productsApi.update('p-1', { name: 'اسم جديد', price: 200 });

    expect(apiClient.patch).toHaveBeenCalledWith('/products/p-1', { name: 'اسم جديد', price: 200 });
    const body = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body instanceof FormData).toBe(false);
  });
});

describe('productsApi.addImages — FormData construction (Gap #3 fix)', () => {
  it('appends every file under the "images" key', async () => {
    await productsApi.addImages('p-1', [makeFile('x.jpg'), makeFile('y.jpg')]);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const entries = form.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('x.jpg');
    expect((entries[1] as File).name).toBe('y.jpg');
  });

  it('POSTs to /products/:id/images with the multipart Content-Type header', async () => {
    await productsApi.addImages('p-1', [makeFile('x.jpg')]);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/products/p-1/images',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });
});

describe('productsApi.removeImage (Gap #3 fix)', () => {
  it('calls DELETE /products/:id/images with the URL in the request body', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await productsApi.removeImage('p-1', 'https://example.com/img.jpg');
    expect(apiClient.delete).toHaveBeenCalledWith('/products/p-1/images', {
      data: { imageUrl: 'https://example.com/img.jpg' },
    });
  });
});

describe('productsApi — endpoint/method correctness (regression guard)', () => {
  it('getAll calls GET /products with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
    await productsApi.getAll({ page: 1, storeId: 's-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/products', { params: { page: 1, storeId: 's-1' } });
  });

  it('getMine calls GET /products/me (not /products/mine)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
    await productsApi.getMine({ status: 'ACTIVE' });
    expect(apiClient.get).toHaveBeenCalledWith('/products/me', { params: { status: 'ACTIVE' } });
  });

  it('getById calls GET /products/:id', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await productsApi.getById('p-1');
    expect(apiClient.get).toHaveBeenCalledWith('/products/p-1');
  });

  it('delete calls DELETE /products/:id', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    await productsApi.delete('p-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/products/p-1');
  });
});

describe('productsApi — paginated response unwrapping', () => {
  it('getAll returns { items, meta } derived from the top-level data/meta.pagination', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 'p-1' }],
        meta: { pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } },
      },
    });
    const res = await productsApi.getAll();
    expect(res.data.data.items).toEqual([{ id: 'p-1' }]);
    expect(res.data.data.meta.total).toBe(1);
  });

  it('getMine returns { items, meta } the same way', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 'p-2' }],
        meta: { pagination: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false } },
      },
    });
    const res = await productsApi.getMine();
    expect(res.data.data.items).toEqual([{ id: 'p-2' }]);
  });
});
