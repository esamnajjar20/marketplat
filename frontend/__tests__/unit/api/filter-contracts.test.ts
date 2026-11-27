import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { customersApi } from '@/api/customers.api';
import { searchApi } from '@/api/search.api';
import { salesApi } from '@/api/sales.api';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('central filter API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], meta: {} } } as never);
  });

  it('serializes global search through the global-search profile', async () => {
    await searchApi.search({
      q: 'laptop',
      type: 'products',
      city: 'غزة',
      categoryId: 'cat-1',
      minPrice: 100,
      maxPrice: 500,
      sort: 'price_asc',
      page: 2,
      limit: 20,
      // Must not leak unrecognized caller properties into the API request.
      debug: true,
    } as never);

    expect((apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][1].params.toString()).toBe('q=laptop&type=products&city=%D8%BA%D8%B2%D8%A9&categoryId=cat-1&minPrice=100&maxPrice=500&sort=price_asc&page=2&limit=20');
  });

  it('serializes customer lists through the customer profile', async () => {
    await customersApi.list({ page: 3, limit: 25, q: 'Ahmad', dueOnly: true });

    expect((apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][1].params.toString()).toBe('page=3&limit=25&q=Ahmad&dueOnly=true');
  });

  it('serializes sales cost products through the sales-cost profile', async () => {
    await salesApi.costProducts({ page: 2, limit: 10, q: 'phone', ignored: 'nope' } as never);

    expect((apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0][1].params.toString()).toBe('page=2&limit=10&q=phone');
  });
});
