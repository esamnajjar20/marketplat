import {
  searchQuerySchema,
  searchSuggestionsQuerySchema,
} from '../../src/modules/search/search.validation';

describe('search.validation', () => {
  describe('searchQuerySchema', () => {
    it('defaults type to "all" and sort to "relevance" when omitted', () => {
      const result = searchQuerySchema.parse({ query: {} });
      expect(result.query.type).toBe('all');
      expect(result.query.sort).toBe('relevance');
    });

    it('accepts every valid type value', () => {
      for (const type of ['all', 'ads', 'products', 'stores', 'services']) {
        expect(searchQuerySchema.parse({ query: { type } }).query.type).toBe(type);
      }
    });

    it('rejects an invalid type value', () => {
      expect(() => searchQuerySchema.parse({ query: { type: 'bogus' } })).toThrow();
    });

    it('accepts every valid sort value', () => {
      for (const sort of ['relevance', 'rating', 'newest', 'views']) {
        expect(searchQuerySchema.parse({ query: { sort } }).query.sort).toBe(sort);
      }
    });

    it('rejects an invalid sort value', () => {
      expect(() => searchQuerySchema.parse({ query: { sort: 'bogus' } })).toThrow();
    });

    it('rejects an empty q string (explicit q="" is invalid, not just absent)', () => {
      expect(() => searchQuerySchema.parse({ query: { q: '' } })).toThrow();
    });

    it('accepts a non-empty q', () => {
      const result = searchQuerySchema.parse({ query: { q: 'iphone' } });
      expect(result.query.q).toBe('iphone');
    });

    it('rejects a q longer than 200 characters', () => {
      expect(() => searchQuerySchema.parse({ query: { q: 'x'.repeat(201) } })).toThrow();
    });

    it('coerces string page/limit into numbers', () => {
      const result = searchQuerySchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page above 1000', () => {
      expect(() => searchQuerySchema.parse({ query: { page: '1001' } })).toThrow();
    });

    it('rejects a limit above 50 (tighter cap than the ads module\'s 100)', () => {
      expect(() => searchQuerySchema.parse({ query: { limit: '51' } })).toThrow();
    });

    it('accepts a limit at exactly 50', () => {
      const result = searchQuerySchema.parse({ query: { limit: '50' } });
      expect(result.query.limit).toBe(50);
    });

    it('accepts an optional categoryId', () => {
      const result = searchQuerySchema.parse({ query: { categoryId: 'cat-1' } });
      expect(result.query.categoryId).toBe('cat-1');
    });

    it('accepts an optional city up to 100 characters', () => {
      const result = searchQuerySchema.parse({ query: { city: 'Gaza' } });
      expect(result.query.city).toBe('Gaza');
    });

    it('rejects a city longer than 100 characters', () => {
      expect(() => searchQuerySchema.parse({ query: { city: 'x'.repeat(101) } })).toThrow();
    });
  });

  describe('searchSuggestionsQuerySchema', () => {
    it('accepts a valid q', () => {
      const result = searchSuggestionsQuerySchema.parse({ query: { q: 'iph' } });
      expect(result.query.q).toBe('iph');
    });

    it('rejects a missing q', () => {
      expect(() => searchSuggestionsQuerySchema.parse({ query: {} })).toThrow();
    });

    it('rejects an empty q', () => {
      expect(() => searchSuggestionsQuerySchema.parse({ query: { q: '' } })).toThrow(
        /Search query is required/
      );
    });

    it('rejects a q longer than 100 characters', () => {
      expect(() =>
        searchSuggestionsQuerySchema.parse({ query: { q: 'x'.repeat(101) } })
      ).toThrow();
    });

    it('has no pagination or sort fields (autocomplete-only surface)', () => {
      const result = searchSuggestionsQuerySchema.parse({ query: { q: 'iph' } });
      expect((result.query as any).page).toBeUndefined();
      expect((result.query as any).sort).toBeUndefined();
    });
  });
});
