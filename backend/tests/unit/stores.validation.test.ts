import {
  createStoreSchema,
  updateStoreSchema,
  storeIdSchema,
  getStoresSchema,
  updateStoreStatusSchema,
  createStoreReviewSchema,
  getStoreReviewsSchema,
} from '../../src/modules/stores/stores.validation';

describe('stores.validation', () => {
  describe('createStoreSchema', () => {
    const valid = {
      name: 'My Store',
      description: 'A store description with enough characters',
      city: 'غزة',
      phone: '0599111222',
    };

    it('accepts a fully valid body', () => {
      expect(() => createStoreSchema.parse({ body: valid })).not.toThrow();
    });

    it('accepts optional address, logoUrl, coverImageUrl, latitude, longitude', () => {
      const result = createStoreSchema.parse({
        body: {
          ...valid,
          address: 'Main street',
          logoUrl: 'https://example.com/logo.png',
          coverImageUrl: 'https://example.com/cover.png',
          latitude: 31.5,
          longitude: 34.4,
        },
      });
      expect(result.body.address).toBe('Main street');
      expect(result.body.latitude).toBe(31.5);
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => createStoreSchema.parse({ body: { ...valid, name: 'A' } })).toThrow();
    });

    it('rejects a name longer than 100 characters', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, name: 'A'.repeat(101) } })
      ).toThrow();
    });

    it('rejects a description shorter than 10 characters', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, description: 'short' } })
      ).toThrow();
    });

    it('rejects a description longer than 1000 characters', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, description: 'A'.repeat(1001) } })
      ).toThrow();
    });

    it('rejects a missing city', () => {
      const { city, ...rest } = valid;
      expect(() => createStoreSchema.parse({ body: rest })).toThrow();
    });

    it('rejects a phone shorter than 7 characters', () => {
      expect(() => createStoreSchema.parse({ body: { ...valid, phone: '123' } })).toThrow();
    });

    it('rejects a phone longer than 20 characters', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, phone: '1'.repeat(21) } })
      ).toThrow();
    });

    it('rejects an invalid logoUrl', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, logoUrl: 'not-a-url' } })
      ).toThrow();
    });

    it('rejects an invalid coverImageUrl', () => {
      expect(() =>
        createStoreSchema.parse({ body: { ...valid, coverImageUrl: 'not-a-url' } })
      ).toThrow();
    });

    it('rejects a latitude out of range', () => {
      expect(() => createStoreSchema.parse({ body: { ...valid, latitude: 91 } })).toThrow();
      expect(() => createStoreSchema.parse({ body: { ...valid, latitude: -91 } })).toThrow();
    });

    it('rejects a longitude out of range', () => {
      expect(() => createStoreSchema.parse({ body: { ...valid, longitude: 181 } })).toThrow();
      expect(() => createStoreSchema.parse({ body: { ...valid, longitude: -181 } })).toThrow();
    });
  });

  describe('updateStoreSchema', () => {
    it('accepts an empty body (all fields optional)', () => {
      expect(() => updateStoreSchema.parse({ body: {} })).not.toThrow();
    });

    it('accepts a partial update of a single field', () => {
      const result = updateStoreSchema.parse({ body: { name: 'Renamed' } });
      expect(result.body.name).toBe('Renamed');
    });

    it('accepts explicit null for nullable fields (address, logoUrl, coverImageUrl, lat/lng)', () => {
      expect(() =>
        updateStoreSchema.parse({
          body: {
            address: null,
            logoUrl: null,
            coverImageUrl: null,
            latitude: null,
            longitude: null,
          },
        })
      ).not.toThrow();
    });

    it('rejects an invalid logoUrl when provided', () => {
      expect(() => updateStoreSchema.parse({ body: { logoUrl: 'not-a-url' } })).toThrow();
    });

    it('rejects a description shorter than 10 characters when provided', () => {
      expect(() => updateStoreSchema.parse({ body: { description: 'short' } })).toThrow();
    });
  });

  describe('storeIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => storeIdSchema.parse({ params: { id: 'store-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => storeIdSchema.parse({ params: { id: '' } })).toThrow();
    });

    it('rejects a missing id param', () => {
      expect(() => storeIdSchema.parse({ params: {} })).toThrow();
    });
  });

  describe('getStoresSchema', () => {
    it('accepts an empty query', () => {
      expect(() => getStoresSchema.parse({ query: {} })).not.toThrow();
    });

    it('coerces page and limit from strings', () => {
      const result = getStoresSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below 1', () => {
      expect(() => getStoresSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('rejects a limit above 100', () => {
      expect(() => getStoresSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('accepts city and search filters', () => {
      const result = getStoresSchema.parse({ query: { city: 'غزة', search: 'phones' } });
      expect(result.query.city).toBe('غزة');
      expect(result.query.search).toBe('phones');
    });

    it('accepts sortBy values createdAt and name', () => {
      expect(() => getStoresSchema.parse({ query: { sortBy: 'createdAt' } })).not.toThrow();
      expect(() => getStoresSchema.parse({ query: { sortBy: 'name' } })).not.toThrow();
    });

    it('rejects an unsupported sortBy value', () => {
      expect(() => getStoresSchema.parse({ query: { sortBy: 'popularity' } })).toThrow();
    });

    it('rejects an unsupported sortOrder value', () => {
      expect(() => getStoresSchema.parse({ query: { sortOrder: 'sideways' } })).toThrow();
    });
  });

  describe('updateStoreStatusSchema', () => {
    it('accepts PENDING, ACTIVE, and BLOCKED', () => {
      for (const status of ['PENDING', 'ACTIVE', 'BLOCKED']) {
        expect(() =>
          updateStoreStatusSchema.parse({ params: { id: 'store-1' }, body: { status } })
        ).not.toThrow();
      }
    });

    it('rejects an invalid status value', () => {
      expect(() =>
        updateStoreStatusSchema.parse({ params: { id: 'store-1' }, body: { status: 'CLOSED' } })
      ).toThrow();
    });

    it('rejects a missing id param', () => {
      expect(() =>
        updateStoreStatusSchema.parse({ params: {}, body: { status: 'ACTIVE' } })
      ).toThrow();
    });
  });

  describe('createStoreReviewSchema', () => {
    it('accepts a valid score with a comment', () => {
      expect(() =>
        createStoreReviewSchema.parse({
          params: { id: 'store-1' },
          body: { score: 5, comment: 'Great store' },
        })
      ).not.toThrow();
    });

    it('accepts a valid score without a comment', () => {
      expect(() =>
        createStoreReviewSchema.parse({ params: { id: 'store-1' }, body: { score: 3 } })
      ).not.toThrow();
    });

    it('coerces a numeric-string score', () => {
      const result = createStoreReviewSchema.parse({
        params: { id: 'store-1' },
        body: { score: '4' },
      });
      expect(result.body.score).toBe(4);
    });

    it('rejects a score below 1', () => {
      expect(() =>
        createStoreReviewSchema.parse({ params: { id: 'store-1' }, body: { score: 0 } })
      ).toThrow();
    });

    it('rejects a score above 5', () => {
      expect(() =>
        createStoreReviewSchema.parse({ params: { id: 'store-1' }, body: { score: 6 } })
      ).toThrow();
    });

    it('rejects a non-integer score', () => {
      expect(() =>
        createStoreReviewSchema.parse({ params: { id: 'store-1' }, body: { score: 3.5 } })
      ).toThrow();
    });

    it('rejects a comment longer than 500 characters', () => {
      expect(() =>
        createStoreReviewSchema.parse({
          params: { id: 'store-1' },
          body: { score: 5, comment: 'A'.repeat(501) },
        })
      ).toThrow();
    });
  });

  describe('getStoreReviewsSchema', () => {
    it('accepts an id param with an empty query', () => {
      expect(() =>
        getStoreReviewsSchema.parse({ params: { id: 'store-1' }, query: {} })
      ).not.toThrow();
    });

    it('coerces page and limit from strings', () => {
      const result = getStoreReviewsSchema.parse({
        params: { id: 'store-1' },
        query: { page: '2', limit: '5' },
      });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(5);
    });

    it('rejects a missing id param', () => {
      expect(() => getStoreReviewsSchema.parse({ params: {}, query: {} })).toThrow();
    });
  });
});
