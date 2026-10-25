import {
  createServiceRequestSchema,
  respondToServiceRequestSchema,
  serviceRequestIdSchema,
  getServiceRequestsSchema,
} from '../../src/modules/service-requests/service-requests.validation';

describe('service-requests.validation', () => {
  describe('createServiceRequestSchema', () => {
    const valid = { listingId: 'listing-1', details: 'Please fix my sink pipe' };

    it('accepts a valid request with no attachedImages', () => {
      expect(() => createServiceRequestSchema.parse({ body: valid })).not.toThrow();
    });

    it('rejects an empty listingId', () => {
      expect(() =>
        createServiceRequestSchema.parse({ body: { ...valid, listingId: '' } })
      ).toThrow();
    });

    it('rejects details shorter than 10 characters', () => {
      expect(() =>
        createServiceRequestSchema.parse({ body: { ...valid, details: 'short' } })
      ).toThrow();
    });

    it('rejects details longer than 1000 characters', () => {
      expect(() =>
        createServiceRequestSchema.parse({ body: { ...valid, details: 'A'.repeat(1001) } })
      ).toThrow();
    });

    it('accepts up to 5 attachedImages', () => {
      const result = createServiceRequestSchema.parse({
        body: {
          ...valid,
          attachedImages: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`),
        },
      });
      expect(result.body.attachedImages).toHaveLength(5);
    });

    it('rejects more than 5 attachedImages', () => {
      expect(() =>
        createServiceRequestSchema.parse({
          body: {
            ...valid,
            attachedImages: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`),
          },
        })
      ).toThrow();
    });

    it('rejects a non-URL entry in attachedImages', () => {
      expect(() =>
        createServiceRequestSchema.parse({ body: { ...valid, attachedImages: ['not-a-url'] } })
      ).toThrow();
    });
  });

  describe('respondToServiceRequestSchema', () => {
    const validParams = { id: 'request-1' };

    it('accepts a valid action with no prices', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({ params: validParams, body: { action: 'ACCEPTED' } })
      ).not.toThrow();
    });

    it.each(['ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])(
      'accepts action %s',
      action => {
        expect(() =>
          respondToServiceRequestSchema.parse({ params: validParams, body: { action } })
        ).not.toThrow();
      }
    );

    it('rejects PENDING as a target action (never a transition target)', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({ params: validParams, body: { action: 'PENDING' } })
      ).toThrow();
    });

    it('rejects an unrecognized action', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({ params: validParams, body: { action: 'BOGUS' } })
      ).toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({ params: { id: '' }, body: { action: 'ACCEPTED' } })
      ).toThrow();
    });

    it('coerces a string quotedPrice to a number', () => {
      const result = respondToServiceRequestSchema.parse({
        params: validParams,
        body: { action: 'ACCEPTED', quotedPrice: '150.50' },
      });
      expect(result.body.quotedPrice).toBe(150.5);
    });

    it('rejects a non-positive quotedPrice', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({
          params: validParams,
          body: { action: 'ACCEPTED', quotedPrice: 0 },
        })
      ).toThrow();
    });

    it('rejects a negative agreedPrice', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({
          params: validParams,
          body: { action: 'COMPLETED', agreedPrice: -10 },
        })
      ).toThrow();
    });

    it('rejects a price with more than 2 decimal places', () => {
      expect(() =>
        respondToServiceRequestSchema.parse({
          params: validParams,
          body: { action: 'ACCEPTED', quotedPrice: 10.999 },
        })
      ).toThrow();
    });

    it('accepts a price with exactly 2 decimal places', () => {
      const result = respondToServiceRequestSchema.parse({
        params: validParams,
        body: { action: 'ACCEPTED', quotedPrice: 10.99 },
      });
      expect(result.body.quotedPrice).toBe(10.99);
    });
  });

  describe('serviceRequestIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => serviceRequestIdSchema.parse({ params: { id: 'request-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => serviceRequestIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('getServiceRequestsSchema', () => {
    it('accepts an empty query (all fields optional)', () => {
      expect(() => getServiceRequestsSchema.parse({ query: {} })).not.toThrow();
    });

    it('coerces string page/limit query params to numbers', () => {
      const result = getServiceRequestsSchema.parse({ query: { page: '2', limit: '10' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a page below the minimum of 1', () => {
      expect(() => getServiceRequestsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('rejects a limit above the maximum of 100', () => {
      expect(() => getServiceRequestsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('accepts a valid status filter', () => {
      const result = getServiceRequestsSchema.parse({ query: { status: 'IN_PROGRESS' } });
      expect(result.query.status).toBe('IN_PROGRESS');
    });

    it('rejects an invalid status filter', () => {
      expect(() => getServiceRequestsSchema.parse({ query: { status: 'BOGUS' } })).toThrow();
    });
  });
});
