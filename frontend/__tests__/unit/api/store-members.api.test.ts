/**
 * __tests__/unit/api/store-members.api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeMembersApi } from '@/api/store-members.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// unwrapPaginated may be used — mock response shapes accordingly
vi.mock('@/lib/apiHelpers', () => ({
  unwrapPaginated: (r: { data: unknown }) => r,
}), { partial: true });

describe('storeMembersApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.delete).mockReset();
  });

  it('list members', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: { items: [], meta: {} } },
    });
    await storeMembersApi.list('store-1');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/stores/store-1/members',
      expect.any(Object),
    );
  });

  it('invite member', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    await storeMembersApi.invite('store-1', { email: 'a@b.com', role: 'EDITOR' } as never);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/stores/store-1/members',
      expect.objectContaining({ email: 'a@b.com' }),
    );
  });

  it('update role', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } });
    await storeMembersApi.updateRole('store-1', 'm1', { role: 'VIEWER' } as never);
    expect(apiClient.patch).toHaveBeenCalledWith(
      '/stores/store-1/members/m1',
      expect.any(Object),
    );
  });

  it('remove member', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { data: null } });
    await storeMembersApi.remove('store-1', 'm1');
    expect(apiClient.delete).toHaveBeenCalledWith('/stores/store-1/members/m1');
  });
});
