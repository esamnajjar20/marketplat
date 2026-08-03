import { searchService } from '../../src/modules/search/search.service';
import { searchRepository } from '../../src/modules/search/search.repository';
import { redis } from '../../src/config/redis';
import type { RawSearchRow } from '../../src/modules/search/search.types';
import type { SearchQuery } from '../../src/modules/search/search.validation';

jest.mock('../../src/modules/search/search.repository');

const mockRow: RawSearchRow = {
  id: 'ad-1',
  type: 'ad',
  title: 'iPhone 13',
  description: 'Barely used',
  image: 'http://img/1.jpg',
  city: 'Gaza',
  rating: 4.5,
  views: 10,
  price: '500',
  seller_id: 'seller-1',
  seller_name: 'Ahmad',
  seller_verified: true,
  url_id: 'ad-1',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  rank: 0.5,
};

const baseQuery: SearchQuery = { type: 'all', sort: 'relevance' };

describe('searchService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('normalizes each raw row into the flattened SearchResult shape', async () => {
      (searchRepository.search as jest.Mock).mockResolvedValue({ rows: [mockRow], total: 1 });
      (searchRepository.buildUrl as jest.Mock).mockReturnValue('/ads/ad-1');

      const result = await searchService.search(baseQuery);

      expect(result.results).toEqual([
        {
          id: 'ad-1',
          type: 'ad',
          title: 'iPhone 13',
          description: 'Barely used',
          image: 'http://img/1.jpg',
          city: 'Gaza',
          rating: 4.5,
          views: 10,
          price: '500',
          seller: { id: 'seller-1', name: 'Ahmad', verified: true },
          url: '/ads/ad-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('builds the pagination meta from total/page/limit', async () => {
      (searchRepository.search as jest.Mock).mockResolvedValue({ rows: [], total: 45 });

      const result = await searchService.search({ ...baseQuery, page: 2, limit: 20 });

      expect(result.pagination).toMatchObject({ total: 45, page: 2, limit: 20 });
    });

    it('defaults page and limit when not provided in the query', async () => {
      (searchRepository.search as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

      const result = await searchService.search(baseQuery);

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('returns an empty results array for an empty rows list', async () => {
      (searchRepository.search as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

      const result = await searchService.search(baseQuery);

      expect(result.results).toEqual([]);
    });

    it('delegates the type-specific url building to searchRepository.buildUrl per row type', async () => {
      const productRow = { ...mockRow, id: 'p1', type: 'product' as const, url_id: 'p1' };
      (searchRepository.search as jest.Mock).mockResolvedValue({
        rows: [mockRow, productRow],
        total: 2,
      });
      (searchRepository.buildUrl as jest.Mock)
        .mockReturnValueOnce('/ads/ad-1')
        .mockReturnValueOnce('/products/p1');

      const result = await searchService.search(baseQuery);

      expect(searchRepository.buildUrl).toHaveBeenNthCalledWith(1, 'ad', 'ad-1');
      expect(searchRepository.buildUrl).toHaveBeenNthCalledWith(2, 'product', 'p1');
      expect(result.results[0].url).toBe('/ads/ad-1');
      expect(result.results[1].url).toBe('/products/p1');
    });
  });

  describe('suggest — cache branches', () => {
    const query = { q: 'iph' };

    it('returns the cached value on a cache hit, without querying the DB', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(['iPhone 15']));

      const result = await searchService.suggest(query);

      expect(result).toEqual(['iPhone 15']);
      expect(searchRepository.suggest).not.toHaveBeenCalled();
    });

    it('queries the DB and writes through to cache on a cache miss', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (searchRepository.suggest as jest.Mock).mockResolvedValue(['iPhone 15']);

      const result = await searchService.suggest(query);

      expect(result).toEqual(['iPhone 15']);
      expect(redis.setex).toHaveBeenCalledWith(
        'search:suggestions:iph',
        300,
        JSON.stringify(['iPhone 15'])
      );
    });

    it('lowercases and trims the query for the cache key', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (searchRepository.suggest as jest.Mock).mockResolvedValue([]);

      await searchService.suggest({ q: '  IPhone  ' });

      expect(redis.get).toHaveBeenCalledWith('search:suggestions:iphone');
    });

    it('falls back to the DB when the cache read itself fails', async () => {
      jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (searchRepository.suggest as jest.Mock).mockResolvedValue(['iPhone 15']);

      const result = await searchService.suggest(query);

      expect(result).toEqual(['iPhone 15']);
      expect(searchRepository.suggest).toHaveBeenCalled();
    });

    it('still returns the DB result even when the cache write-through fails', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('redis down'));
      (searchRepository.suggest as jest.Mock).mockResolvedValue(['iPhone 15']);

      const result = await searchService.suggest(query);

      expect(result).toEqual(['iPhone 15']);
    });

    it('passes the fixed suggestions limit through to the repository', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockResolvedValue('OK');
      (searchRepository.suggest as jest.Mock).mockResolvedValue([]);

      await searchService.suggest(query);

      expect(searchRepository.suggest).toHaveBeenCalledWith('iph', 8);
    });
  });
});
