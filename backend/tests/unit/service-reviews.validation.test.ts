import {
  createServiceReviewSchema,
  getServiceReviewsSchema,
} from '../../src/modules/service-reviews/service-reviews.validation';

describe('service-reviews.validation', () => {
  describe('createServiceReviewSchema', () => {
    it('accepts a valid review with a comment', () => {
      const result = createServiceReviewSchema.parse({
        body: { requestId: 'request-1', score: 5, comment: 'Great work' },
      });
      expect(result.body.score).toBe(5);
      expect(result.body.comment).toBe('Great work');
    });

    it('accepts a valid review without a comment', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 3 } })
      ).not.toThrow();
    });

    it('rejects an empty requestId', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: '', score: 5 } })
      ).toThrow();
    });

    it('coerces a string score to a number', () => {
      const result = createServiceReviewSchema.parse({
        body: { requestId: 'request-1', score: '4' },
      });
      expect(result.body.score).toBe(4);
    });

    it('rejects a score below 1', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 0 } })
      ).toThrow();
    });

    it('rejects a score above 5', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 6 } })
      ).toThrow();
    });

    it('rejects a non-integer score', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 3.5 } })
      ).toThrow();
    });

    it('accepts boundary scores 1 and 5', () => {
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 1 } })
      ).not.toThrow();
      expect(() =>
        createServiceReviewSchema.parse({ body: { requestId: 'request-1', score: 5 } })
      ).not.toThrow();
    });

    it('rejects a comment longer than 500 characters', () => {
      expect(() =>
        createServiceReviewSchema.parse({
          body: { requestId: 'request-1', score: 5, comment: 'A'.repeat(501) },
        })
      ).toThrow();
    });

    it('accepts a comment of exactly 500 characters (boundary)', () => {
      expect(() =>
        createServiceReviewSchema.parse({
          body: { requestId: 'request-1', score: 5, comment: 'A'.repeat(500) },
        })
      ).not.toThrow();
    });
  });

  describe('getServiceReviewsSchema', () => {
    it('accepts a valid sellerProfileId with no query params', () => {
      expect(() =>
        getServiceReviewsSchema.parse({ params: { sellerProfileId: 'seller-profile-1' }, query: {} })
      ).not.toThrow();
    });

    it('rejects an empty sellerProfileId', () => {
      expect(() =>
        getServiceReviewsSchema.parse({ params: { sellerProfileId: '' }, query: {} })
      ).toThrow();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getServiceReviewsSchema.parse({
        params: { sellerProfileId: 'seller-profile-1' },
        query: { page: '2', limit: '10' },
      });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below the minimum of 1', () => {
      expect(() =>
        getServiceReviewsSchema.parse({
          params: { sellerProfileId: 'seller-profile-1' },
          query: { page: '0' },
        })
      ).toThrow();
    });

    it('rejects a limit above the maximum of 100', () => {
      expect(() =>
        getServiceReviewsSchema.parse({
          params: { sellerProfileId: 'seller-profile-1' },
          query: { limit: '101' },
        })
      ).toThrow();
    });
  });
});
