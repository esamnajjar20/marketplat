/**
 * __tests__/unit/lib/apiPagination.test.ts
 *
 * FIX API-SHAPE-01: unwrapPaginated is the single point every paginated
 * list endpoint (ads, admin ads/users/reports, favorites, user ads) now
 * goes through to correct the mismatch between what the backend
 * actually sends — items directly on `data`, pagination under the
 * top-level `meta.pagination` — and the { items, meta } shape every
 * query hook and component already expects from `.data.data`.
 */
import { describe, it, expect } from 'vitest';
import type { AxiosResponse } from 'axios';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';

function makeAxiosResponse<T>(body: ApiResponse<T>): AxiosResponse<ApiResponse<T>> {
  return {
    data: body,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

describe('unwrapPaginated', () => {
  it('moves the top-level data array into data.items', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const res = makeAxiosResponse({ success: true, message: 'ok', data: items });

    const result = unwrapPaginated(res);

    expect(result.data.data.items).toEqual(items);
  });

  it('moves meta.pagination into data.meta', () => {
    const pagination = { total: 2, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
    const res = makeAxiosResponse({
      success: true, message: 'ok', data: [{ id: '1' }], meta: { pagination },
    });

    const result = unwrapPaginated(res);

    expect(result.data.data.meta).toEqual(pagination);
  });

  it('does not mutate the original response object', () => {
    const original = makeAxiosResponse({ success: true, message: 'ok', data: [{ id: '1' }] });
    const originalDataRef = original.data;

    unwrapPaginated(original);

    expect(original.data).toBe(originalDataRef);
  });

  it('defaults items to an empty array when data is missing entirely', () => {
    const res = makeAxiosResponse<{ id: string }[]>({ success: true, message: 'ok' });

    const result = unwrapPaginated(res);

    expect(result.data.data.items).toEqual([]);
  });

  it('defaults meta to real zero values (not undefined) when meta.pagination is missing', () => {
    const res = makeAxiosResponse({ success: true, message: 'ok', data: [{ id: '1' }] });

    const result = unwrapPaginated(res);

    expect(result.data.data.meta).toEqual({
      total: 0, page: 1, limit: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false,
    });
    // Every field must be a real value a component's `.totalPages` etc.
    // can safely read — never `undefined` silently typed as a number.
    expect(result.data.data.meta.totalPages).toBe(0);
  });

  it('preserves success/message on the outer envelope', () => {
    const res = makeAxiosResponse({ success: true, message: 'Ads fetched', data: [] });

    const result = unwrapPaginated(res);

    expect(result.data.success).toBe(true);
    expect(result.data.message).toBe('Ads fetched');
  });
});
