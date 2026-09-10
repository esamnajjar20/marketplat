/**
 * __tests__/unit/api/service-broadcasts.api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('serviceBroadcastsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.delete).mockReset();
    vi.mocked(apiClient.patch).mockReset();
  });

  it('getOpenFeed hits /service-broadcasts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    await serviceBroadcastsApi.getOpenFeed({ page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/service-broadcasts', {
      params: { page: 1 },
    });
  });

  it('getMyBroadcasts hits /me', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    await serviceBroadcastsApi.getMyBroadcasts();
    expect(apiClient.get).toHaveBeenCalledWith('/service-broadcasts/me', {
      params: undefined,
    });
  });

  it('create posts body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { id: '1' } } });
    await serviceBroadcastsApi.create({
      categoryId: 'c1',
      title: 'طلب',
      description: 'وصف',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/service-broadcasts', {
      categoryId: 'c1',
      title: 'طلب',
      description: 'وصف',
    });
  });

  it('submitQuote and acceptQuote', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } });
    await serviceBroadcastsApi.submitQuote('b1', { price: 100 });
    expect(apiClient.post).toHaveBeenCalledWith('/service-broadcasts/b1/quotes', {
      price: 100,
    });
    await serviceBroadcastsApi.acceptQuote('b1', 'q1');
    expect(apiClient.patch).toHaveBeenCalledWith(
      '/service-broadcasts/b1/quotes/q1/accept',
    );
  });

  it('withdrawQuote deletes', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { data: {} } });
    await serviceBroadcastsApi.withdrawQuote('b1', 'q1');
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/service-broadcasts/b1/quotes/q1',
    );
  });
});
