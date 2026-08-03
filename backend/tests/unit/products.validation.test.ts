import {
  createProductSchema,
  updateProductSchema,
  getProductsSchema,
  productIdSchema,
} from '../../src/modules/products/products.validation';

describe('products.validation', () => {
  describe('createProductSchema', () => {
    const valid = {
      categoryId: 'cat-1',
      name: 'Phone',
      description: 'A long enough description',
      price: 100,
    };

    it('applies default availability IN_STOCK when omitted', () => {
      const result = createProductSchema.parse({ body: valid });
      expect(result.body.availability).toBe('IN_STOCK');
    });

    it('accepts an explicit availability value', () => {
      const result = createProductSchema.parse({ body: { ...valid, availability: 'LIMITED' } });
      expect(result.body.availability).toBe('LIMITED');
    });

    it('rejects an invalid availability enum value', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, availability: 'BOGUS' } })
      ).toThrow();
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => createProductSchema.parse({ body: { ...valid, name: 'P' } })).toThrow();
    });

    it('rejects a description shorter than 10 characters', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, description: 'short' } })
      ).toThrow();
    });

    it('rejects a negative price', () => {
      expect(() => createProductSchema.parse({ body: { ...valid, price: -10 } })).toThrow(
        /positive/
      );
    });

    it('rejects a price with more than 2 decimal places', () => {
      expect(() => createProductSchema.parse({ body: { ...valid, price: 10.999 } })).toThrow(
        /decimal places/
      );
    });

    it('coerces a string price into a number', () => {
      const result = createProductSchema.parse({ body: { ...valid, price: '25.50' } });
      expect(result.body.price).toBe(25.5);
    });

    it('requires categoryId', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, categoryId: '' } })
      ).toThrow();
    });

    it('rejects discountPrice that is not less than price', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, price: 100, discountPrice: 100 } })
      ).toThrow(/discountPrice must be less than price/);
    });

    it('accepts a discountPrice lower than price', () => {
      const result = createProductSchema.parse({
        body: { ...valid, price: 100, discountPrice: 80 },
      });
      expect(result.body.discountPrice).toBe(80);
    });

    it('rejects wholesalePrice provided without wholesaleMinQty', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, wholesalePrice: 70 } })
      ).toThrow(/must be provided together/);
    });

    it('rejects wholesaleMinQty provided without wholesalePrice', () => {
      expect(() =>
        createProductSchema.parse({ body: { ...valid, wholesaleMinQty: 10 } })
      ).toThrow(/must be provided together/);
    });

    it('accepts wholesalePrice and wholesaleMinQty provided together', () => {
      const result = createProductSchema.parse({
        body: { ...valid, wholesalePrice: 70, wholesaleMinQty: 10 },
      });
      expect(result.body.wholesalePrice).toBe(70);
      expect(result.body.wholesaleMinQty).toBe(10);
    });

    it('accepts neither wholesalePrice nor wholesaleMinQty', () => {
      const result = createProductSchema.parse({ body: valid });
      expect(result.body.wholesalePrice).toBeUndefined();
      expect(result.body.wholesaleMinQty).toBeUndefined();
    });

    it('rejects a non-integer wholesaleMinQty', () => {
      expect(() =>
        createProductSchema.parse({
          body: { ...valid, wholesalePrice: 70, wholesaleMinQty: 2.5 },
        })
      ).toThrow();
    });
  });

  describe('updateProductSchema', () => {
    it('accepts an empty body', () => {
      const result = updateProductSchema.parse({ params: { id: 'product-1' }, body: {} });
      expect(result.body).toEqual({});
    });

    it('accepts a null discountPrice (explicit clear)', () => {
      const result = updateProductSchema.parse({
        params: { id: 'product-1' },
        body: { discountPrice: null },
      });
      expect(result.body.discountPrice).toBeNull();
    });

    it('accepts a null wholesalePrice (explicit clear)', () => {
      const result = updateProductSchema.parse({
        params: { id: 'product-1' },
        body: { wholesalePrice: null },
      });
      expect(result.body.wholesalePrice).toBeNull();
    });

    it('accepts a null wholesaleMinQty (explicit clear)', () => {
      const result = updateProductSchema.parse({
        params: { id: 'product-1' },
        body: { wholesaleMinQty: null },
      });
      expect(result.body.wholesaleMinQty).toBeNull();
    });

    it('accepts a status transition value', () => {
      const result = updateProductSchema.parse({
        params: { id: 'product-1' },
        body: { status: 'PAUSED' },
      });
      expect(result.body.status).toBe('PAUSED');
    });

    it('rejects an invalid status enum value', () => {
      expect(() =>
        updateProductSchema.parse({ params: { id: 'product-1' }, body: { status: 'BOGUS' } })
      ).toThrow();
    });

    it('rejects an invalid availability enum value', () => {
      expect(() =>
        updateProductSchema.parse({
          params: { id: 'product-1' },
          body: { availability: 'BOGUS' },
        })
      ).toThrow();
    });

    it('requires a non-empty id in params', () => {
      expect(() => updateProductSchema.parse({ params: { id: '' }, body: {} })).toThrow();
    });
  });

  describe('getProductsSchema', () => {
    it('parses with no query params at all', () => {
      const result = getProductsSchema.parse({ query: {} });
      expect(result.query.page).toBeUndefined();
      expect(result.query.minPrice).toBeUndefined();
    });

    it('coerces string page/limit/minPrice/maxPrice into numbers', () => {
      const result = getProductsSchema.parse({
        query: { page: '2', limit: '10', minPrice: '50', maxPrice: '200' },
      });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(10);
      expect(result.query.minPrice).toBe(50);
      expect(result.query.maxPrice).toBe(200);
    });

    it('rejects a page above 1000', () => {
      expect(() => getProductsSchema.parse({ query: { page: '1001' } })).toThrow();
    });

    it('rejects a limit above 100', () => {
      expect(() => getProductsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('rejects a negative minPrice', () => {
      expect(() => getProductsSchema.parse({ query: { minPrice: '-5' } })).toThrow();
    });

    it('accepts a valid sortBy field', () => {
      expect(getProductsSchema.parse({ query: { sortBy: 'views' } }).query.sortBy).toBe('views');
    });

    it('rejects a sortBy field not in the allowed list', () => {
      expect(() => getProductsSchema.parse({ query: { sortBy: 'name' } })).toThrow();
    });

    it('accepts asc and desc sortOrder', () => {
      expect(getProductsSchema.parse({ query: { sortOrder: 'asc' } }).query.sortOrder).toBe('asc');
      expect(getProductsSchema.parse({ query: { sortOrder: 'desc' } }).query.sortOrder).toBe(
        'desc'
      );
    });

    it('rejects an empty search string', () => {
      expect(() => getProductsSchema.parse({ query: { search: '' } })).toThrow();
    });

    it('accepts a valid availability filter', () => {
      expect(
        getProductsSchema.parse({ query: { availability: 'OUT_OF_STOCK' } }).query.availability
      ).toBe('OUT_OF_STOCK');
    });
  });

  describe('productIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = productIdSchema.parse({ params: { id: 'product-1' } });
      expect(result.params.id).toBe('product-1');
    });

    it('rejects an empty id', () => {
      expect(() => productIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
