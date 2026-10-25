/**
 * __tests__/unit/api/home-feed.api.test.ts
 *
 * Static/personal split of the homepage: anonymous visitors use the public,
 * edge-cacheable /home/static; the private /home/feed is for signed-in users.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homeFeedApi } from '@/api/home-feed.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));

describe('homeFeedApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: {} } });
  });

  it('personalised feed hits /home/feed', async () => {
    await homeFeedApi.get({ city: 'غزة' });
    expect(apiClient.get).toHaveBeenCalledWith('/home/feed', { params: { city: 'غزة' } });
  });

  it('guest feed hits /home/static', async () => {
    await homeFeedApi.getStatic({ city: 'غزة' });
    expect(apiClient.get).toHaveBeenCalledWith('/home/static', { params: { city: 'غزة' } });
  });

  it.each(['get', 'getStatic'] as const)('%s sends city=__ALL__ when "كل المدن" is chosen', async (fn) => {
    await homeFeedApi[fn]({ city: 'غزة', explicitAll: true });
    expect(vi.mocked(apiClient.get).mock.calls[0][1]).toEqual({ params: { city: '__ALL__' } });
  });

  it.each(['get', 'getStatic'] as const)('%s omits params when no city is chosen', async (fn) => {
    await homeFeedApi[fn]();
    expect(vi.mocked(apiClient.get).mock.calls[0][1]).toEqual({ params: undefined });
  });
});
