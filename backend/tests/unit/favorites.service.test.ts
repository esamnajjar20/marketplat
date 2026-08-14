import { favoritesService } from '../../src/modules/favorites/favorites.service';
import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/favorites/favorites.repository');
jest.mock('../../src/modules/ads/ads.service');

const mockAd = {
  id: 'ad-1',
  userId: 'owner-1',
  status: 'ACTIVE',
  title: 'Test',
};

describe('FavoritesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('toggleFavorite', () => {
    it('adds favorite when not exists', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (favoritesRepository.findByUserAndAd as jest.Mock).mockResolvedValue(null);
      (favoritesRepository.create as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavorite('user-1', 'ad-1');
      expect(result.action).toBe('added');
    });

    it('removes favorite when exists', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (favoritesRepository.findByUserAndAd as jest.Mock).mockResolvedValue({ id: 'fav-1' });
      (favoritesRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavorite('user-1', 'ad-1');
      expect(result.action).toBe('removed');
    });

    it('throws when ad not found', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(null);
      await expect(favoritesService.toggleFavorite('user-1', 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getMyFavorites', () => {
    it('returns paginated favorites', async () => {
      (favoritesRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        favorites: [{ id: 'fav-1', ad: mockAd }],
        total: 1,
      });

      const result = await favoritesService.getMyFavorites('user-1', { page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // UX-FIX (frontend audit P2-03): covers the new single-ad check that
  // replaces the frontend's previous limit:100 list fetch.
  describe('isFavorited', () => {
    it('returns true when a favorite row exists', async () => {
      (favoritesRepository.findByUserAndAd as jest.Mock).mockResolvedValue({ id: 'fav-1' });

      const result = await favoritesService.isFavorited('user-1', 'ad-1');
      expect(result).toBe(true);
    });

    it('returns false when no favorite row exists', async () => {
      (favoritesRepository.findByUserAndAd as jest.Mock).mockResolvedValue(null);

      const result = await favoritesService.isFavorited('user-1', 'ad-1');
      expect(result).toBe(false);
    });
  });
});
