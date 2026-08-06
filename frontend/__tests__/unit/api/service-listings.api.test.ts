/**
 * __tests__/unit/api/service-listings.api.test.ts
 *
 * Same style as ads.api.test.ts / products.api.test.ts. Previously this
 * module had no dedicated API-client test file at all. Coverage added
 * here focuses on:
 *  - create() FormData construction (scalars coerced to strings,
 *    optional fields omitted when undefined, images appended correctly)
 *  - update() sends plain JSON (not FormData), no images field
 *  - addImages()/removeImage() — Gap #3 fix: these two endpoints did
 *    not exist on the backend or in this client before that fix, so
 *    there was nothing here to test previously.
 *  - endpoint/method correctness regression guard for every other call
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serviceListingsApi } from '@/api/service-listings.api';
import { apiClient } from '@/api/client';
import type { CreateServiceListingPayload } from '@/types/service.types';

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

function makePayload(overrides: Partial<CreateServiceListingPayload> = {}): CreateServiceListingPayload {
  return {
    categoryId: 'cat-1',
    title: 'تصليح أجهزة كهربائية',
    description: 'وصف طويل بما فيه الكفاية لتجاوز حد الأحرف الأدنى',
    pricingType: 'NEGOTIABLE',
    serviceLocation: 'AT_PROVIDER',
    images: [makeFile('a.jpg')],
    ...overrides,
  };
}

describe('serviceListingsApi.create — FormData construction', () => {
  it('appends every scalar field, coercing numbers to strings', async () => {
    await serviceListingsApi.create(
      makePayload({ pricingType: 'FIXED', price: 199.5 })
    );

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('categoryId')).toBe('cat-1');
    expect(form.get('title')).toBe('تصليح أجهزة كهربائية');
    expect(form.get('pricingType')).toBe('FIXED');
    expect(form.get('price')).toBe('199.5');
  });

  it('omits price/durationEstimate when undefined', async () => {
    await serviceListingsApi.create(makePayload());

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.has('price')).toBe(false);
    expect(form.has('durationEstimate')).toBe(false);
  });

  it('appends each file in images as a separate entry under the same key', async () => {
    await serviceListingsApi.create(makePayload({ images: [makeFile('a.jpg'), makeFile('b.jpg')] }));

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const entries = form.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('a.jpg');
    expect((entries[1] as File).name).toBe('b.jpg');
  });

  it('sets the multipart/form-data Content-Type header', async () => {
    await serviceListingsApi.create(makePayload());
    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('POSTs to /service-listings', async () => {
    await serviceListingsApi.create(makePayload());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-listings',
      expect.any(FormData),
      expect.any(Object)
    );
  });
});

describe('serviceListingsApi.addImages — FormData construction (Gap #3 fix)', () => {
  it('appends every file under the "images" key', async () => {
    await serviceListingsApi.addImages('sl-1', [makeFile('x.jpg'), makeFile('y.jpg')]);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const entries = form.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('x.jpg');
    expect((entries[1] as File).name).toBe('y.jpg');
  });

  it('POSTs to /service-listings/:id/images with the multipart Content-Type header', async () => {
    await serviceListingsApi.addImages('sl-1', [makeFile('x.jpg')]);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/service-listings/sl-1/images',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });
});

describe('serviceListingsApi.removeImage (Gap #3 fix)', () => {
  it('calls DELETE /service-listings/:id/images with the URL in the request body', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await serviceListingsApi.removeImage('sl-1', 'https://example.com/img.jpg');
    expect(apiClient.delete).toHaveBeenCalledWith('/service-listings/sl-1/images', {
      data: { imageUrl: 'https://example.com/img.jpg' },
    });
  });
});

describe('serviceListingsApi.update — plain JSON, no images field', () => {
  it('PATCHes /service-listings/:id with the JSON payload (not FormData)', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await serviceListingsApi.update('sl-1', { title: 'عنوان جديد' });

    expect(apiClient.patch).toHaveBeenCalledWith('/service-listings/sl-1', { title: 'عنوان جديد' });
    const body = (apiClient.patch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body instanceof FormData).toBe(false);
  });
});

describe('serviceListingsApi — endpoint/method correctness (regression guard)', () => {
  it('getAll calls GET /service-listings with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
    await serviceListingsApi.getAll({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/service-listings', { params: { page: 1 } });
  });

  it('getMine calls GET /service-listings/me (not /service-listings/mine)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
    await serviceListingsApi.getMine({ page: 1 } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/service-listings/me', { params: { page: 1 } });
  });

  it('getById calls GET /service-listings/:id', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await serviceListingsApi.getById('sl-1');
    expect(apiClient.get).toHaveBeenCalledWith('/service-listings/sl-1');
  });

  it('delete calls DELETE /service-listings/:id', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    await serviceListingsApi.delete('sl-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/service-listings/sl-1');
  });
});
