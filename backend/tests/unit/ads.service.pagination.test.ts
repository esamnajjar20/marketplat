import { adsService } from '../../src/modules/ads/ads.service';
import { adsRepository } from '../../src/modules/ads/ads.repository';

jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/config/cloudinary', () => ({ uploadImage: jest.fn(), deleteImage: jest.fn() }));
jest.mock('../../src/shared/utils/viewsBuffer', () => ({ viewsBuffer: { increment: jest.fn() } }));

describe('adsService pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getAds uses default page and limit', async () => {
    (adsRepository.findMany as jest.Mock).mockResolvedValue({ ads: [], total: 0 });
    const result = await adsService.getAds({});
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(20);
  });

  it('getMyAds passes query to repository', async () => {
    (adsRepository.findManyByUserId as jest.Mock).mockResolvedValue({ ads: [], total: 5 });
    const result = await adsService.getMyAds('user-1', { page: 2, limit: 10 });
    expect(result.meta.total).toBe(5);
    expect(result.meta.page).toBe(2);
  });
});
