/**
 * FIX TEST-V4-10: ads.api.ts's create() and addImages() build a
 * FormData object with real branching logic (images arrays get
 * per-file .append() calls, scalar fields get String()-coerced single
 * appends, undefined fields are skipped entirely) — this is genuine
 * logic, not a thin wrapper, and had zero test coverage since every
 * existing hook test (e.g. useAdMutations.test.tsx) mocks the entire
 * ads.api module, bypassing this code path completely.
 *
 * Mocks api/client.ts (one layer deeper than the existing hook tests)
 * so the real create()/addImages() functions execute, letting their
 * actual FormData output be inspected directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adsApi } from '@/api/ads.api';
import { apiClient } from '@/api/client';
import type { CreateAdPayload } from '@/types/ad.types';

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

describe('adsApi.create — FormData construction', () => {
  it('appends every scalar field as a String-coerced value', async () => {
    const payload: CreateAdPayload = {
      title: 'Test ad', description: 'A description', city: 'غزة', price: 150,
    };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('title')).toBe('Test ad');
    expect(form.get('description')).toBe('A description');
    expect(form.get('city')).toBe('غزة');
    expect(form.get('price')).toBe('150');
  });

  it('appends each file in the images array as a separate entry under the same "images" key', async () => {
    const payload: CreateAdPayload = {
      title: 'Test ad', description: 'A description', city: 'غزة',
      images: [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')],
    };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const imageEntries = form.getAll('images');
    expect(imageEntries).toHaveLength(3);
    expect((imageEntries[0] as File).name).toBe('a.jpg');
    expect((imageEntries[2] as File).name).toBe('c.jpg');
  });

  it('skips fields that are undefined entirely, rather than sending the literal string "undefined"', async () => {
    const payload: CreateAdPayload = {
      title: 'Test ad', description: 'A description', city: 'غزة',
      price: undefined, categoryId: undefined,
    };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.has('price')).toBe(false);
    expect(form.has('categoryId')).toBe(false);
  });

  it('correctly coerces a falsy-but-present boolean (false) instead of treating it like an absent field', async () => {
    const payload: CreateAdPayload = {
      title: 'Test ad', description: 'A description', city: 'غزة', isNegotiable: false,
    };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    // The real risk here: a naive `if (value)` check (instead of
    // `if (value === undefined)`) would have silently dropped this
    // field for any falsy-but-meaningful value (false, 0, '').
    expect(form.has('isNegotiable')).toBe(true);
    expect(form.get('isNegotiable')).toBe('false');
  });

  it('correctly coerces a falsy-but-present number (price: 0)', async () => {
    const payload: CreateAdPayload = {
      title: 'Free item', description: 'A description', city: 'غزة', price: 0,
    };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.has('price')).toBe(true);
    expect(form.get('price')).toBe('0');
  });

  it('sends an empty images field set when no images are provided (no "images" key at all)', async () => {
    const payload: CreateAdPayload = { title: 'Test ad', description: 'A description', city: 'غزة' };
    await adsApi.create(payload);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.getAll('images')).toHaveLength(0);
  });

  it('sets the multipart/form-data Content-Type header', async () => {
    await adsApi.create({ title: 'Test ad', description: 'A description', city: 'غزة' });

    const config = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('POSTs to /ads', async () => {
    await adsApi.create({ title: 'Test ad', description: 'A description', city: 'غزة' });
    expect(apiClient.post).toHaveBeenCalledWith('/ads', expect.any(FormData), expect.any(Object));
  });
});

describe('adsApi.addImages — FormData construction', () => {
  it('appends every file under the "images" key', async () => {
    await adsApi.addImages('ad-1', [makeFile('x.jpg'), makeFile('y.jpg')]);

    const form = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    const entries = form.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('x.jpg');
    expect((entries[1] as File).name).toBe('y.jpg');
  });

  it('POSTs to /ads/:id/images with the multipart Content-Type header', async () => {
    await adsApi.addImages('ad-1', [makeFile('x.jpg')]);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/ads/ad-1/images',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
  });
});

describe('adsApi — endpoint/method correctness (regression guard)', () => {
  // FIX C-06 (historical bug this guards against): getMyAds previously
  // called the wrong path ('/ads/my' instead of '/ads/me'). These pin
  // every endpoint's exact path/method so a similar typo fails a test
  // immediately instead of silently shipping a 404.
  it('getAll calls GET /ads', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await adsApi.getAll({ page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/ads', { params: { page: 1 } });
  });

  it('getMyAds calls GET /ads/me (not /ads/my)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await adsApi.getMyAds({ page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/ads/me', { params: { page: 1 } });
  });

  it('searchAds calls GET /ads/search', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await adsApi.searchAds({ q: 'phone' } as any);
    expect(apiClient.get).toHaveBeenCalledWith('/ads/search', { params: { q: 'phone' } });
  });

  it('markAsSold calls PATCH /ads/:id with status: SOLD (no dedicated /sold endpoint exists)', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await adsApi.markAsSold('ad-1');
    expect(apiClient.patch).toHaveBeenCalledWith('/ads/ad-1', { status: 'SOLD' });
  });

  it('removeImage calls DELETE /ads/:id/images with the URL in the request body', async () => {
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    await adsApi.removeImage('ad-1', 'https://example.com/img.jpg');
    expect(apiClient.delete).toHaveBeenCalledWith('/ads/ad-1/images', {
      data: { imageUrl: 'https://example.com/img.jpg' },
    });
  });
});
