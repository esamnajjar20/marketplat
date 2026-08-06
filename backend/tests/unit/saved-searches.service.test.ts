import {
  savedSearchesService,
  savedSearchEvents,
  __testables__,
} from '../../src/modules/saved-searches/saved-searches.service';
import { savedSearchesRepository } from '../../src/modules/saved-searches/saved-searches.repository';
import { notificationEvents } from '../../src/modules/notifications';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import type { AdWithAuthor } from '../../src/modules/ads/ads.repository';

jest.mock('../../src/modules/saved-searches/saved-searches.repository');
jest.mock('../../src/modules/notifications');

const { matchesFilters } = __testables__;

const baseAd = {
  id: 'ad-1',
  userId: 'seller-1',
  title: 'iPhone 13 for sale',
  description: 'Excellent condition, barely used, comes with original box',
  city: 'Gaza',
  categoryId: 'cat-1',
  condition: 'USED',
  price: 500,
} as unknown as AdWithAuthor;

describe('savedSearchesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getMySavedSearches', () => {
    it('delegates to the repository for the given userId', async () => {
      (savedSearchesRepository.findManyByUserId as jest.Mock).mockResolvedValue([]);
      await savedSearchesService.getMySavedSearches('user-1');
      expect(savedSearchesRepository.findManyByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createSavedSearch', () => {
    const input = { label: 'Cheap phones', filters: { city: 'Gaza' } } as any;

    it('creates the saved search when under the per-user limit', async () => {
      (savedSearchesRepository.countByUserId as jest.Mock).mockResolvedValue(5);
      (savedSearchesRepository.create as jest.Mock).mockResolvedValue({ id: 'search-1' });

      const result = await savedSearchesService.createSavedSearch('user-1', input);

      expect(result).toEqual({ id: 'search-1' });
      expect(savedSearchesRepository.create).toHaveBeenCalledWith(
        'user-1',
        'Cheap phones',
        { city: 'Gaza' }
      );
    });

    it('rejects at exactly the max limit (20)', async () => {
      (savedSearchesRepository.countByUserId as jest.Mock).mockResolvedValue(20);

      await expect(savedSearchesService.createSavedSearch('user-1', input)).rejects.toThrow(
        BadRequestError
      );
      expect(savedSearchesRepository.create).not.toHaveBeenCalled();
    });

    it('allows creation one below the max limit (19)', async () => {
      (savedSearchesRepository.countByUserId as jest.Mock).mockResolvedValue(19);
      (savedSearchesRepository.create as jest.Mock).mockResolvedValue({ id: 'search-1' });

      await expect(
        savedSearchesService.createSavedSearch('user-1', input)
      ).resolves.toEqual({ id: 'search-1' });
    });

    it('includes the limit in the error meta', async () => {
      (savedSearchesRepository.countByUserId as jest.Mock).mockResolvedValue(20);

      try {
        await savedSearchesService.createSavedSearch('user-1', input);
        fail('expected rejection');
      } catch (err) {
        expect((err as BadRequestError).meta).toEqual({ maxPerUser: 20 });
      }
    });
  });

  describe('deleteSavedSearch', () => {
    it('resolves silently when a row was actually deleted', async () => {
      (savedSearchesRepository.delete as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(
        savedSearchesService.deleteSavedSearch('search-1', 'user-1')
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted (missing or wrong owner)', async () => {
      (savedSearchesRepository.delete as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        savedSearchesService.deleteSavedSearch('search-1', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('matchesFilters (unit)', () => {
    it('matches when filters is empty-equivalent (all keys undefined)', () => {
      expect(matchesFilters(baseAd, {})).toBe(true);
    });

    it('matches on q as a case-insensitive substring of the title', () => {
      expect(matchesFilters(baseAd, { q: 'iphone' })).toBe(true);
      expect(matchesFilters(baseAd, { q: 'IPHONE 13' })).toBe(true);
    });

    // AUDIT-FIX (5.11/9.7) regression: q previously matched title only,
    // so an ad matching solely through its description never surfaced
    // to a saved-search owner.
    it('matches on q as a case-insensitive substring of the description', () => {
      expect(matchesFilters(baseAd, { q: 'original box' })).toBe(true);
      expect(matchesFilters(baseAd, { q: 'BARELY USED' })).toBe(true);
    });

    it('does not match when q is not found in the title', () => {
      expect(matchesFilters(baseAd, { q: 'samsung' })).toBe(false);
    });

    it('does not match when q is found in neither title nor description', () => {
      expect(matchesFilters(baseAd, { q: 'samsung galaxy' })).toBe(false);
    });

    it('matches on city case-insensitively', () => {
      expect(matchesFilters(baseAd, { city: 'gaza' })).toBe(true);
      expect(matchesFilters(baseAd, { city: 'GAZA' })).toBe(true);
    });

    it('does not match a different city', () => {
      expect(matchesFilters(baseAd, { city: 'Ramallah' })).toBe(false);
    });

    it('matches on exact categoryId', () => {
      expect(matchesFilters(baseAd, { categoryId: 'cat-1' })).toBe(true);
      expect(matchesFilters(baseAd, { categoryId: 'cat-2' })).toBe(false);
    });

    it('matches on exact condition', () => {
      expect(matchesFilters(baseAd, { condition: 'USED' } as any)).toBe(true);
      expect(matchesFilters(baseAd, { condition: 'NEW' } as any)).toBe(false);
    });

    it('matches when price is within minPrice/maxPrice range', () => {
      expect(matchesFilters(baseAd, { minPrice: 100, maxPrice: 1000 })).toBe(true);
    });

    it('does not match when price is below minPrice', () => {
      expect(matchesFilters(baseAd, { minPrice: 600 })).toBe(false);
    });

    it('does not match when price is above maxPrice', () => {
      expect(matchesFilters(baseAd, { maxPrice: 100 })).toBe(false);
    });

    it('does not match a priced filter when the ad has a null price', () => {
      const adNoPrice = { ...baseAd, price: null } as unknown as AdWithAuthor;
      expect(matchesFilters(adNoPrice, { minPrice: 0 })).toBe(false);
      expect(matchesFilters(adNoPrice, { maxPrice: 1000 })).toBe(false);
    });

    it('requires every provided filter to match simultaneously', () => {
      expect(
        matchesFilters(baseAd, { city: 'Gaza', categoryId: 'cat-1', minPrice: 100 })
      ).toBe(true);
      expect(
        matchesFilters(baseAd, { city: 'Gaza', categoryId: 'cat-2', minPrice: 100 })
      ).toBe(false);
    });
  });

  describe('savedSearchEvents.onAdCreated', () => {
    const otherUserSearch = {
      id: 'search-1',
      userId: 'buyer-1',
      label: 'Cheap phones',
      filters: { q: 'iPhone' },
    } as any;

    it('excludes the ad author\'s own saved searches from matching', async () => {
      const ownSearch = { ...otherUserSearch, userId: 'seller-1' };
      (savedSearchesRepository.findAllForMatching as jest.Mock).mockResolvedValue([ownSearch]);

      await savedSearchEvents.onAdCreated(baseAd);

      expect(notificationEvents.onSavedSearchMatched).not.toHaveBeenCalled();
    });

    it('notifies matched saved searches and marks them notified', async () => {
      (savedSearchesRepository.findAllForMatching as jest.Mock).mockResolvedValue([
        otherUserSearch,
      ]);
      (notificationEvents.onSavedSearchMatched as jest.Mock).mockResolvedValue({ count: 1 });
      (savedSearchesRepository.markNotified as jest.Mock).mockResolvedValue({ count: 1 });

      await savedSearchEvents.onAdCreated(baseAd);

      expect(notificationEvents.onSavedSearchMatched).toHaveBeenCalledWith(
        [{ userId: 'buyer-1', savedSearchId: 'search-1', label: 'Cheap phones' }],
        'ad-1',
        'iPhone 13 for sale'
      );
      expect(savedSearchesRepository.markNotified).toHaveBeenCalledWith(['search-1']);
    });

    it('does nothing when no saved search matches', async () => {
      const nonMatching = { ...otherUserSearch, filters: { city: 'Ramallah' } };
      (savedSearchesRepository.findAllForMatching as jest.Mock).mockResolvedValue([nonMatching]);

      await savedSearchEvents.onAdCreated(baseAd);

      expect(notificationEvents.onSavedSearchMatched).not.toHaveBeenCalled();
      expect(savedSearchesRepository.markNotified).not.toHaveBeenCalled();
    });

    it('does not call markNotified when there are no candidates at all', async () => {
      (savedSearchesRepository.findAllForMatching as jest.Mock).mockResolvedValue([]);

      await savedSearchEvents.onAdCreated(baseAd);

      expect(savedSearchesRepository.markNotified).not.toHaveBeenCalled();
    });
  });
});
