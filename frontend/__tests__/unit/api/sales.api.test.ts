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

describe('salesApi.dashboard and receipt', () => {
  it('passes the explicit no-retry-on-500 policy to the dashboard request', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: {} } });

    await salesApi.dashboard({ signal, skipServerErrorRetry: true });

    expect(apiClient.get).toHaveBeenCalledWith('/sales/dashboard', {
      signal,
      skipServerErrorRetry: true,
    });
  });

  it('loads receipts from the configured API client and forwards cancellation', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: { sale: { id: 'sale/1' } } } });

    await salesApi.receipt('sale/1', { signal });

    expect(apiClient.get).toHaveBeenCalledWith('/sales/sale%2F1/receipt', { signal });
  });
});
