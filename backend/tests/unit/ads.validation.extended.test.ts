import {
  createAdSchema,
  updateAdSchema,
  getAdsSchema,
  getMyAdsSchema,
  adIdSchema,
  searchAdsSchema,
} from '../../src/modules/ads/ads.validation';

describe('ads.validation — additional coverage', () => {
  describe('createAdSchema — field limits', () => {
    const valid = {
      title: 'A nice used bicycle',
      description: 'Barely used, great condition, comes with lock',
      city: 'Gaza',
      isNegotiable: false,
    };

    it('accepts a fully valid body', () => {
      expect(() => createAdSchema.parse({ body: valid })).not.toThrow();
    });

    it('rejects a title shorter than 3 characters', () => {
      expect(() => createAdSchema.parse({ body: { ...valid, title: 'ab' } })).toThrow();
    });

    it('rejects a title longer than 200 characters', () => {
      expect(() => createAdSchema.parse({ body: { ...valid, title: 'A'.repeat(201) } })).toThrow();
    });

    it('rejects a description shorter than 10 characters', () => {
      expect(() =>
        createAdSchema.parse({ body: { ...valid, description: 'short' } })
      ).toThrow();
    });

    it('rejects a description longer than 5000 characters', () => {
      expect(() =>
        createAdSchema.parse({ body: { ...valid, description: 'A'.repeat(5001) } })
      ).toThrow();
    });

    it('rejects a city shorter than 2 characters', () => {
      expect(() => createAdSchema.parse({ body: { ...valid, city: 'G' } })).toThrow();
    });

    it('coerces a string price and rejects a non-positive one', () => {
      const result = createAdSchema.parse({ body: { ...valid, price: '99.99' } });
      expect(result.body.price).toBe(99.99);
      expect(() => createAdSchema.parse({ body: { ...valid, price: '0' } })).toThrow();
    });

    it('rejects a price with more than 2 decimal places', () => {
      expect(() => createAdSchema.parse({ body: { ...valid, price: '10.999' } })).toThrow();
    });

    it('accepts an omitted price', () => {
      expect(() => createAdSchema.parse({ body: valid })).not.toThrow();
    });

    it('accepts a valid condition enum value and rejects an invalid one', () => {
      expect(() =>
        createAdSchema.parse({ body: { ...valid, condition: 'NEW' } })
      ).not.toThrow();
      expect(() =>
        createAdSchema.parse({ body: { ...valid, condition: 'BOGUS' } })
      ).toThrow();
    });
  });

  describe('updateAdSchema', () => {
    const validParams = { id: 'ad-1' };

    it('accepts an empty body (all fields optional)', () => {
      expect(() => updateAdSchema.parse({ params: validParams, body: {} })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() =>
        updateAdSchema.parse({ params: { id: '' }, body: {} })
      ).toThrow();
    });

    it('allows price to be explicitly nulled (unlike createAdSchema)', () => {
      const result = updateAdSchema.parse({ params: validParams, body: { price: null } });
      expect(result.body.price).toBeNull();
    });

    it('allows categoryId and condition to be explicitly nulled', () => {
      const result = updateAdSchema.parse({
        params: validParams,
        body: { categoryId: null, condition: null },
      });
      expect(result.body.categoryId).toBeNull();
      expect(result.body.condition).toBeNull();
    });

    it('accepts a valid status transition value', () => {
      const result = updateAdSchema.parse({ params: validParams, body: { status: 'SOLD' } });
      expect(result.body.status).toBe('SOLD');
    });

    it('rejects an invalid status value', () => {
      expect(() =>
        updateAdSchema.parse({ params: validParams, body: { status: 'BOGUS' } })
      ).toThrow();
    });
  });

  describe('getAdsSchema', () => {
    it('accepts an empty query', () => {
      expect(() => getAdsSchema.parse({ query: {} })).not.toThrow();
    });

    it('rejects an empty-string search (must be absent, not empty)', () => {
      expect(() => getAdsSchema.parse({ query: { search: '' } })).toThrow();
    });

    it('accepts a non-empty search string', () => {
      const result = getAdsSchema.parse({ query: { search: 'bicycle' } });
      expect(result.query.search).toBe('bicycle');
    });

    it('coerces page/limit query strings to numbers', () => {
      const result = getAdsSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a limit above the maximum of 100', () => {
      expect(() => getAdsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('rejects a page below the minimum of 1', () => {
      expect(() => getAdsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('accepts a valid sortOrder and rejects an invalid one', () => {
      expect(() => getAdsSchema.parse({ query: { sortOrder: 'asc' } })).not.toThrow();
      expect(() => getAdsSchema.parse({ query: { sortOrder: 'sideways' } })).toThrow();
    });
  });

  describe('getMyAdsSchema', () => {
    it('accepts all AdStatus values, including DELETED (self-view only)', () => {
      for (const status of ['ACTIVE', 'SOLD', 'DELETED']) {
        expect(() => getMyAdsSchema.parse({ query: { status } })).not.toThrow();
      }
    });

    it('rejects an invalid status', () => {
      expect(() => getMyAdsSchema.parse({ query: { status: 'BOGUS' } })).toThrow();
    });

    it('still applies the shared getAdsSchema query rules (e.g. empty search rejected)', () => {
      expect(() => getMyAdsSchema.parse({ query: { search: '' } })).toThrow();
    });
  });

  describe('adIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => adIdSchema.parse({ params: { id: 'ad-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => adIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('searchAdsSchema', () => {
    it('requires a non-empty q', () => {
      expect(() => searchAdsSchema.parse({ query: { q: 'bicycle' } })).not.toThrow();
      expect(() => searchAdsSchema.parse({ query: {} })).toThrow();
      expect(() => searchAdsSchema.parse({ query: { q: '' } })).toThrow();
    });

    it('rejects a q longer than 200 characters', () => {
      expect(() => searchAdsSchema.parse({ query: { q: 'A'.repeat(201) } })).toThrow();
    });

    it('still applies the shared getAdsSchema query rules alongside q', () => {
      const result = searchAdsSchema.parse({ query: { q: 'bicycle', city: 'Gaza', page: '2' } });
      expect(result.query.city).toBe('Gaza');
      expect(result.query.page).toBe(2);
    });
  });
});

