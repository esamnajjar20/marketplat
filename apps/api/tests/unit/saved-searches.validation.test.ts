import {
  savedSearchFiltersSchema,
  createSavedSearchSchema,
  savedSearchIdSchema,
} from '../../src/modules/saved-searches/saved-searches.validation';

describe('saved-searches.validation', () => {
  describe('savedSearchFiltersSchema', () => {
    it('accepts a filter set with only q', () => {
      const result = savedSearchFiltersSchema.parse({ q: 'iphone' });
      expect(result.q).toBe('iphone');
    });

    it('accepts a filter set with only city', () => {
      const result = savedSearchFiltersSchema.parse({ city: 'Gaza' });
      expect(result.city).toBe('Gaza');
    });

    it('accepts a filter set with only categoryId', () => {
      const result = savedSearchFiltersSchema.parse({ categoryId: 'cat-1' });
      expect(result.categoryId).toBe('cat-1');
    });

    it('accepts a filter set with only condition', () => {
      const result = savedSearchFiltersSchema.parse({ condition: 'NEW' });
      expect(result.condition).toBe('NEW');
    });

    it('accepts a filter set with only minPrice or maxPrice', () => {
      expect(savedSearchFiltersSchema.parse({ minPrice: 50 }).minPrice).toBe(50);
      expect(savedSearchFiltersSchema.parse({ maxPrice: 200 }).maxPrice).toBe(200);
    });

    it('rejects an entirely empty filter set (no real criteria)', () => {
      expect(() => savedSearchFiltersSchema.parse({})).toThrow(/At least one filter/);
    });

    it('rejects an empty q string', () => {
      expect(() => savedSearchFiltersSchema.parse({ q: '' })).toThrow();
    });

    it('rejects a negative minPrice', () => {
      expect(() => savedSearchFiltersSchema.parse({ minPrice: -5 })).toThrow();
    });

    it('rejects a negative maxPrice', () => {
      expect(() => savedSearchFiltersSchema.parse({ maxPrice: -5 })).toThrow();
    });

    it('rejects an invalid condition enum value', () => {
      expect(() => savedSearchFiltersSchema.parse({ condition: 'BOGUS' })).toThrow();
    });

    it('rejects minPrice greater than maxPrice', () => {
      expect(() =>
        savedSearchFiltersSchema.parse({ minPrice: 200, maxPrice: 100 })
      ).toThrow(/must not exceed/);
    });

    it('accepts minPrice equal to maxPrice', () => {
      const result = savedSearchFiltersSchema.parse({ minPrice: 100, maxPrice: 100 });
      expect(result.minPrice).toBe(100);
      expect(result.maxPrice).toBe(100);
    });

    it('does not coerce numeric strings (expects real JSON numbers)', () => {
      expect(() => savedSearchFiltersSchema.parse({ minPrice: '50' as any })).toThrow();
    });

    it('accepts a combination of multiple filters at once', () => {
      const result = savedSearchFiltersSchema.parse({
        q: 'iphone',
        city: 'Gaza',
        categoryId: 'cat-1',
        condition: 'USED',
        minPrice: 100,
        maxPrice: 1000,
      });
      expect(result).toMatchObject({
        q: 'iphone',
        city: 'Gaza',
        categoryId: 'cat-1',
        condition: 'USED',
        minPrice: 100,
        maxPrice: 1000,
      });
    });
  });

  describe('createSavedSearchSchema', () => {
    it('accepts a valid label and filters', () => {
      const result = createSavedSearchSchema.parse({
        body: { label: 'Cheap phones', filters: { city: 'Gaza' } },
      });
      expect(result.body.label).toBe('Cheap phones');
    });

    it('rejects an empty label', () => {
      expect(() =>
        createSavedSearchSchema.parse({ body: { label: '', filters: { city: 'Gaza' } } })
      ).toThrow(/Label is required/);
    });

    it('rejects a label longer than 100 characters', () => {
      expect(() =>
        createSavedSearchSchema.parse({
          body: { label: 'x'.repeat(101), filters: { city: 'Gaza' } },
        })
      ).toThrow();
    });

    it('rejects when filters is missing entirely', () => {
      expect(() =>
        createSavedSearchSchema.parse({ body: { label: 'Cheap phones' } })
      ).toThrow();
    });

    it('rejects when filters has no real criteria', () => {
      expect(() =>
        createSavedSearchSchema.parse({ body: { label: 'Cheap phones', filters: {} } })
      ).toThrow(/At least one filter/);
    });
  });

  describe('savedSearchIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = savedSearchIdSchema.parse({ params: { id: 'search-1' } });
      expect(result.params.id).toBe('search-1');
    });

    it('rejects an empty id', () => {
      expect(() => savedSearchIdSchema.parse({ params: { id: '' } })).toThrow(
        /Saved search ID is required/
      );
    });
  });
});
