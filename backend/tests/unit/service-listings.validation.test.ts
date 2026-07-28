import {
  createServiceListingSchema,
  updateServiceListingSchema,
  getServiceListingsSchema,
  serviceListingIdSchema,
} from '../../src/modules/service-listings/service-listings.validation';

describe('service-listings.validation', () => {
  describe('createServiceListingSchema', () => {
    const valid = {
      categoryId: 'cat-1',
      title: 'Home cleaning',
      description: 'Deep cleaning service for homes',
    };

    it('applies default pricingType NEGOTIABLE and serviceLocation AT_PROVIDER when omitted', () => {
      const result = createServiceListingSchema.parse({ body: valid });
      expect(result.body.pricingType).toBe('NEGOTIABLE');
      expect(result.body.serviceLocation).toBe('AT_PROVIDER');
    });

    it('accepts explicit pricingType and serviceLocation', () => {
      const result = createServiceListingSchema.parse({
        body: { ...valid, pricingType: 'FIXED', serviceLocation: 'REMOTE' },
      });
      expect(result.body.pricingType).toBe('FIXED');
      expect(result.body.serviceLocation).toBe('REMOTE');
    });

    it('rejects an invalid pricingType enum value', () => {
      expect(() =>
        createServiceListingSchema.parse({ body: { ...valid, pricingType: 'FREE' } })
      ).toThrow();
    });

    it('rejects a title shorter than 3 characters', () => {
      expect(() => createServiceListingSchema.parse({ body: { ...valid, title: 'Hi' } })).toThrow();
    });

    it('rejects a description shorter than 10 characters', () => {
      expect(() =>
        createServiceListingSchema.parse({ body: { ...valid, description: 'too short' } })
      ).toThrow();
    });

    it('rejects a negative price', () => {
      expect(() => createServiceListingSchema.parse({ body: { ...valid, price: -10 } })).toThrow(
        /positive/
      );
    });

    it('rejects a price with more than 2 decimal places', () => {
      expect(() => createServiceListingSchema.parse({ body: { ...valid, price: 10.999 } })).toThrow(
        /decimal places/
      );
    });

    it('accepts a price with exactly 2 decimal places', () => {
      const result = createServiceListingSchema.parse({ body: { ...valid, price: 19.99 } });
      expect(result.body.price).toBe(19.99);
    });

    it('coerces a string price into a number', () => {
      const result = createServiceListingSchema.parse({ body: { ...valid, price: '25.50' } });
      expect(result.body.price).toBe(25.5);
    });

    it('omits price entirely when not given (optional)', () => {
      const result = createServiceListingSchema.parse({ body: valid });
      expect(result.body.price).toBeUndefined();
    });
  });

  describe('updateServiceListingSchema', () => {
    it('accepts an empty body', () => {
      const result = updateServiceListingSchema.parse({ params: { id: 'listing-1' }, body: {} });
      expect(result.body).toEqual({});
    });

    it('accepts a null price (explicit clear)', () => {
      const result = updateServiceListingSchema.parse({
        params: { id: 'listing-1' },
        body: { price: null },
      });
      expect(result.body.price).toBeNull();
    });

    it('accepts a null durationEstimate (explicit clear)', () => {
      const result = updateServiceListingSchema.parse({
        params: { id: 'listing-1' },
        body: { durationEstimate: null },
      });
      expect(result.body.durationEstimate).toBeNull();
    });

    it('accepts a status transition value', () => {
      const result = updateServiceListingSchema.parse({
        params: { id: 'listing-1' },
        body: { status: 'PAUSED' },
      });
      expect(result.body.status).toBe('PAUSED');
    });

    it('rejects an invalid status enum value', () => {
      expect(() =>
        updateServiceListingSchema.parse({ params: { id: 'listing-1' }, body: { status: 'BOGUS' } })
      ).toThrow();
    });
  });

  describe('getServiceListingsSchema', () => {
    it('parses with no query params at all', () => {
      const result = getServiceListingsSchema.parse({ query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.minPrice).toBeUndefined();
    });

    it('coerces string page/limit/minPrice/maxPrice into numbers', () => {
      const result = getServiceListingsSchema.parse({
        query: { page: '2', limit: '10', minPrice: '50', maxPrice: '200' },
      });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
      expect(result.query.minPrice).toBe(50);
      expect(result.query.maxPrice).toBe(200);
    });

    it('rejects a page above 1000', () => {
      expect(() => getServiceListingsSchema.parse({ query: { page: '1001' } })).toThrow();
    });

    it('rejects a negative minPrice', () => {
      expect(() => getServiceListingsSchema.parse({ query: { minPrice: '-5' } })).toThrow();
    });

    it('accepts a valid sortBy field', () => {
      const result = getServiceListingsSchema.parse({ query: { sortBy: 'price' } });
      expect(result.query.sortBy).toBe('price');
    });

    it('rejects a sortBy field not in the allowed list', () => {
      expect(() => getServiceListingsSchema.parse({ query: { sortBy: 'title' } })).toThrow();
    });

    it('accepts asc and desc sortOrder', () => {
      expect(getServiceListingsSchema.parse({ query: { sortOrder: 'asc' } }).query.sortOrder).toBe(
        'asc'
      );
      expect(getServiceListingsSchema.parse({ query: { sortOrder: 'desc' } }).query.sortOrder).toBe(
        'desc'
      );
    });

    it('rejects an empty search string', () => {
      expect(() => getServiceListingsSchema.parse({ query: { search: '' } })).toThrow();
    });
  });

  describe('serviceListingIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = serviceListingIdSchema.parse({ params: { id: 'listing-1' } });
      expect(result.params.id).toBe('listing-1');
    });

    it('rejects an empty id', () => {
      expect(() => serviceListingIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
