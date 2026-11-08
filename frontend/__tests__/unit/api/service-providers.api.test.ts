import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { serviceProvidersApi } from '@/api/service-providers.api';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('serviceProvidersApi.getMyDashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests analytics and the selected own-listings page together with the abort signal', async () => {
    const signal = new AbortController().signal;
    const params = { period: '30d' as const, page: 2, limit: 10, status: 'ACTIVE' as const, search: 'مكيف' };
    const response = { data: { success: true, data: { analytics: { pendingRequests: 2 }, listings: { items: [], meta: {} } } } };
    vi.mocked(apiClient.get).mockResolvedValue(response as never);

    await serviceProvidersApi.getMyDashboard(params, { signal });

    expect(apiClient.get).toHaveBeenCalledWith('/service-providers/me/dashboard', {
      signal,
      params,
    });
  });
});
