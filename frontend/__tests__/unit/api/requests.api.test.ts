import { requestsApi } from '@/api/requests.api';

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { apiClient } from '@/api/client';

describe('requestsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getOpenFeed calls GET /requests with params', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { data: [] } });
    await requestsApi.getOpenFeed({ type: 'SERVICE', page: 1 });
    expect(apiClient.get).toHaveBeenCalledWith('/requests', {
      params: { type: 'SERVICE', page: 1 },
    });
  });

  it('create posts body to /requests', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { data: { id: '1' } } });
    await requestsApi.create({
      type: 'PRODUCT',
      categoryId: 'c1',
      title: 'Want a phone',
      description: 'Looking for used flagship phone',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/requests',
      expect.objectContaining({ type: 'PRODUCT', categoryId: 'c1' }),
    );
  });

  it('acceptOffer patches accept path', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValue({ data: { data: {} } });
    await requestsApi.acceptOffer('req1', 'off1');
    expect(apiClient.patch).toHaveBeenCalledWith('/requests/req1/offers/off1/accept');
  });
});
