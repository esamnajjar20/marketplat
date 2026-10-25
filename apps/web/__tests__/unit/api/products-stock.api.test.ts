/**
 * __tests__/unit/api/products-stock.api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustProductStock } from '@/api/products-stock.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    patch: vi.fn(),
  },
}));

describe('adjustProductStock', () => {
  beforeEach(() => {
    vi.mocked(apiClient.patch).mockReset();
  });

  it('PATCHes stock quantity', async () => {
    const product = { id: 'p1', stockQuantity: 10 };
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: product } });

    const result = await adjustProductStock('p1', 10);
    expect(apiClient.patch).toHaveBeenCalledWith('/products/p1/stock', {
      stockQuantity: 10,
    });
    expect(result).toEqual(product);
  });

  it('allows null stockQuantity', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { id: 'p1', stockQuantity: null } },
    });
    await adjustProductStock('p1', null);
    expect(apiClient.patch).toHaveBeenCalledWith('/products/p1/stock', {
      stockQuantity: null,
    });
  });
});
