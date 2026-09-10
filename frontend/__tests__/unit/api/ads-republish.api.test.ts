/**
 * __tests__/unit/api/ads-republish.api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { republishAd } from '@/api/ads-republish.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

describe('republishAd', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('POSTs to /ads/:id/republish', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    await republishAd('ad-123');
    expect(apiClient.post).toHaveBeenCalledWith('/ads/ad-123/republish');
  });
});
