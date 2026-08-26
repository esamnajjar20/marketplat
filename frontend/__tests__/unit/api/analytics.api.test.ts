import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/api/client';
import { analyticsApi } from '@/api/analytics.api';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  (apiClient.get as any).mockResolvedValue({ data: { data: { totals: {} } } });
});

describe('analyticsApi', () => {
  it('getSummary → GET /admin/analytics/summary', async () => {
    const result = await analyticsApi.getSummary({ from: '2024-01-01', bucket: 'day' });
    expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/summary', {
      params: { from: '2024-01-01', bucket: 'day' },
    });
    expect(result).toEqual({ totals: {} });
  });

  it('getSummary without params', async () => {
    await analyticsApi.getSummary();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/analytics/summary', { params: undefined });
  });
});
