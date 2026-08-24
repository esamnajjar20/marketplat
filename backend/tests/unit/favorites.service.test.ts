import { favoritesService } from '../../src/modules/favorites/favorites.service';
import { favoritesRepository } from '../../src/modules/favorites/favorites.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { productsService } from '../../src/modules/products/products.service';
import { storesService } from '../../src/modules/stores/stores.service';
import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/favorites/favorites.repository');
jest.mock('../../src/modules/ads/ads.service');
// FEAT-FAVORITE-POLYMORPHIC PR2: favorites.service.ts now imports
// these three for resolveEntity's PRODUCT/STORE/SERVICE_LISTING
// branches — without mocking them here, importing favoritesService
// would pull in the real products/stores/service-listings services
// (and transitively Prisma, Cloudinary config, etc.) at test-load
// time, not just when a PRODUCT/STORE/SERVICE_LISTING path actually
// runs.
jest.mock('../../src/modules/products/products.service');
jest.mock('../../src/modules/stores/stores.service');
jest.mock('../../src/modules/service-listings/service-listings.service');

const mockAd = {
  id: 'ad-1',
  userId: 'owner-1',
  status: 'ACTIVE',
  title: 'Test',
};

const mockProduct = { id: 'product-1', name: 'Test Product', status: 'ACTIVE' };
const mockStore = { id: 'store-1', name: 'Test Store', status: 'ACTIVE' };
const mockListing = { id: 'listing-1', title: 'Test Listing', status: 'ACTIVE' };

describe('FavoritesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('toggleFavorite', () => {
    it('adds favorite when not exists', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue(null);
      (favoritesRepository.create as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavorite('user-1', 'ad-1');
      expect(result.action).toBe('added');
      // FEAT-FAVORITE-POLYMORPHIC PR1: this is the actual compatibility-
      // layer guarantee — the /favorites/:adId route still ultimately
      // writes entityType: 'AD' under the hood.
      expect(favoritesRepository.create).toHaveBeenCalledWith('user-1', 'AD', 'ad-1');
    });

    it('removes favorite when exists', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue({ id: 'fav-1' });
      (favoritesRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavorite('user-1', 'ad-1');
      expect(result.action).toBe('removed');
      expect(favoritesRepository.delete).toHaveBeenCalledWith('user-1', 'AD', 'ad-1');
    });

    it('throws when ad not found', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(null);
      await expect(favoritesService.toggleFavorite('user-1', 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  // FEAT-FAVORITE-POLYMORPHIC PR2
  describe('toggleFavoriteEntity', () => {
    it('adds a PRODUCT favorite, resolving via productsService and writing entityType PRODUCT', async () => {
      (productsService.findProductForReference as jest.Mock).mockResolvedValue(mockProduct);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue(null);
      (favoritesRepository.create as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavoriteEntity('user-1', 'PRODUCT', 'product-1');

      expect(result.action).toBe('added');
      expect(productsService.findProductForReference).toHaveBeenCalledWith('product-1');
      expect(favoritesRepository.create).toHaveBeenCalledWith('user-1', 'PRODUCT', 'product-1');
    });

    it('adds a STORE favorite, resolving via storesService', async () => {
      (storesService.findStoreForReference as jest.Mock).mockResolvedValue(mockStore);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue(null);
      (favoritesRepository.create as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavoriteEntity('user-1', 'STORE', 'store-1');

      expect(result.action).toBe('added');
      expect(storesService.findStoreForReference).toHaveBeenCalledWith('store-1');
      expect(favoritesRepository.create).toHaveBeenCalledWith('user-1', 'STORE', 'store-1');
    });

    it('adds a SERVICE_LISTING favorite, resolving via serviceListingsService', async () => {
      (serviceListingsService.findServiceListingForReference as jest.Mock).mockResolvedValue(mockListing);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue(null);
      (favoritesRepository.create as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavoriteEntity(
        'user-1',
        'SERVICE_LISTING',
        'listing-1'
      );

      expect(result.action).toBe('added');
      expect(serviceListingsService.findServiceListingForReference).toHaveBeenCalledWith('listing-1');
      expect(favoritesRepository.create).toHaveBeenCalledWith('user-1', 'SERVICE_LISTING', 'listing-1');
    });

    it('removes an existing PRODUCT favorite', async () => {
      (productsService.findProductForReference as jest.Mock).mockResolvedValue(mockProduct);
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue({ id: 'fav-1' });
      (favoritesRepository.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await favoritesService.toggleFavoriteEntity('user-1', 'PRODUCT', 'product-1');

      expect(result.action).toBe('removed');
      expect(favoritesRepository.delete).toHaveBeenCalledWith('user-1', 'PRODUCT', 'product-1');
    });

    it('throws NotFoundError with a per-type code when the store does not exist', async () => {
      (storesService.findStoreForReference as jest.Mock).mockResolvedValue(null);

      await expect(
        favoritesService.toggleFavoriteEntity('user-1', 'STORE', 'missing')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getMyFavorites', () => {
    it('returns paginated favorites, mapped back to the legacy { adId, ad } wire shape', async () => {
      (favoritesRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        favorites: [
          {
            id: 'fav-1',
            userId: 'user-1',
            entityType: 'AD',
            entityId: 'ad-1',
            createdAt: new Date('2026-01-01'),
            entity: mockAd,
          },
        ],
        total: 1,
      });

      const result = await favoritesService.getMyFavorites('user-1', { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      // FEAT-FAVORITE-POLYMORPHIC PR1: this is the actual compat-layer
      // guarantee for GET /favorites — frontend still gets `.adId`
      // and `.ad`, not `.entityId`/`.entity`.
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: 'fav-1', adId: 'ad-1', ad: mockAd })
      );
      expect((result.items[0] as any).entityType).toBeUndefined();
    });

    it('drops a row whose entity failed to resolve rather than crashing', async () => {
      (favoritesRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        favorites: [
          {
            id: 'fav-1',
            userId: 'user-1',
            entityType: 'AD',
            entityId: 'ad-1',
            createdAt: new Date(),
            entity: null,
          },
        ],
        total: 1,
      });

      const result = await favoritesService.getMyFavorites('user-1', { page: 1, limit: 10 });
      expect(result.items).toHaveLength(0);
    });

    // FEAT-FAVORITE-POLYMORPHIC PR2
    it('with ?type=product, returns the generic { entityType, entityId, entity } shape, not { adId, ad }', async () => {
      (favoritesRepository.findManyByUserId as jest.Mock).mockResolvedValue({
        favorites: [
          {
            id: 'fav-1',
            userId: 'user-1',
            entityType: 'PRODUCT',
            entityId: 'product-1',
            createdAt: new Date('2026-01-01'),
            entity: mockProduct,
          },
        ],
        total: 1,
      });

      const result = await favoritesService.getMyFavorites('user-1', {
        page: 1,
        limit: 10,
        type: 'product',
      });

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: 'fav-1',
          entityType: 'PRODUCT',
          entityId: 'product-1',
          entity: mockProduct,
        })
      );
      expect((result.items[0] as any).adId).toBeUndefined();
      expect((result.items[0] as any).ad).toBeUndefined();
    });
  });

  // UX-FIX (frontend audit P2-03): covers the new single-ad check that
  // replaces the frontend's previous limit:100 list fetch.
  describe('isFavorited', () => {
    it('returns true when a favorite row exists', async () => {
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue({ id: 'fav-1' });

      const result = await favoritesService.isFavorited('user-1', 'ad-1');
      expect(result).toBe(true);
    });

    it('returns false when no favorite row exists', async () => {
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue(null);

      const result = await favoritesService.isFavorited('user-1', 'ad-1');
      expect(result).toBe(false);
    });
  });

  // FEAT-FAVORITE-POLYMORPHIC PR2
  describe('isFavoritedEntity', () => {
    it('returns true when a STORE favorite row exists', async () => {
      (favoritesRepository.findByUserAndEntity as jest.Mock).mockResolvedValue({ id: 'fav-1' });

      const result = await favoritesService.isFavoritedEntity('user-1', 'STORE', 'store-1');

      expect(favoritesRepository.findByUserAndEntity).toHaveBeenCalledWith(
        'user-1',
        'STORE',
        'store-1'
      );
      expect(result).toBe(true);
    });
  });
});
