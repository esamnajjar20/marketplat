import { requestsApi } from '@/api/requests.api';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '@/api/client';

describe('requestsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getOpenFeed calls GET /requests with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
    await requestsApi.getOpenFeed({ type: 'SERVICE', page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/requests', {
      params: { type: 'SERVICE', page: 1 },
    });
  });

  it('create posts body to /requests', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: '1' } } });
    await requestsApi.create({
      type: 'PRODUCT',
      categoryId: 'c1',
      title: 'Want a phone',
      description: 'Looking for used flagship phone',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/requests',
      expect.objectContaining({ type: 'PRODUCT', categoryId: 'c1' }),
      expect.any(Object),
    );
  });

  it('acceptOffer patches accept path', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await requestsApi.acceptOffer('req1', 'off1');
    expect(apiClient.patch).toHaveBeenCalledWith('/requests/req1/offers/off1/accept');
  });
});
