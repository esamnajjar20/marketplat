/**
 * __tests__/unit/api/sales.api.test.ts
 *
 * Regression guard: GET /sales returns { data: { items, meta } } directly
 * (unlike most list endpoints, which put the array on `data` and the meta
 * under `meta.pagination`). salesApi.list must hand that shape through
 * untouched — wrapping it in unwrapPaginated nested { items, meta } inside
 * `items`, which made the sales log render as empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salesApi } from '@/api/sales.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('salesApi.list', () => {
  it('calls GET /sales with params and keeps { items, meta } intact', async () => {
    const sale = { id: 's1', entityTitle: 'x' };
    const meta = { total: 1, page: 1, limit: 12, totalPages: 1, hasNextPage: false, hasPrevPage: false };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: { items: [sale], meta } } });

    const res = await salesApi.list({ page: 1, limit: 12 });

    expect(apiClient.get).toHaveBeenCalledWith('/sales', { params: { page: 1, limit: 12 } });
    expect(Array.isArray(res.data.data?.items)).toBe(true);
    expect(res.data.data?.items).toEqual([sale]);
    expect(res.data.data?.meta).toEqual(meta);
  });
});
