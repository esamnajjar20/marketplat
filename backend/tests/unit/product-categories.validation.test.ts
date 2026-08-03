import {
  createProductCategorySchema,
  updateProductCategorySchema,
  productCategoryIdSchema,
} from '../../src/modules/product-categories/product-categories.validation';

describe('product-categories.validation', () => {
  describe('createProductCategorySchema', () => {
    const valid = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' };

    it('accepts a fully valid payload', () => {
      const result = createProductCategorySchema.parse({ body: valid });
      expect(result.body.name).toBe('Electronics');
      expect(result.body.slug).toBe('electronics');
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() =>
        createProductCategorySchema.parse({ body: { ...valid, name: 'E' } })
      ).toThrow();
    });

    it('rejects a nameAr shorter than 2 characters', () => {
      expect(() =>
        createProductCategorySchema.parse({ body: { ...valid, nameAr: 'إ' } })
      ).toThrow();
    });

    it('rejects a slug with uppercase letters', () => {
      expect(() =>
        createProductCategorySchema.parse({ body: { ...valid, slug: 'Electronics' } })
      ).toThrow(/lowercase/);
    });

    it('rejects a slug with spaces or special characters', () => {
      expect(() =>
        createProductCategorySchema.parse({ body: { ...valid, slug: 'not a valid slug!' } })
      ).toThrow(/lowercase/);
    });

    it('accepts a slug with hyphens and numbers', () => {
      const result = createProductCategorySchema.parse({
        body: { ...valid, slug: 'phones-and-tablets-2' },
      });
      expect(result.body.slug).toBe('phones-and-tablets-2');
    });

    it('accepts an optional icon', () => {
      const result = createProductCategorySchema.parse({
        body: { ...valid, icon: 'phone-icon' },
      });
      expect(result.body.icon).toBe('phone-icon');
    });

    it('accepts an optional parentId for subcategories', () => {
      const result = createProductCategorySchema.parse({
        body: { ...valid, parentId: 'parent-cat-1' },
      });
      expect(result.body.parentId).toBe('parent-cat-1');
    });

    it('omits parentId when not given (top-level category)', () => {
      const result = createProductCategorySchema.parse({ body: valid });
      expect(result.body.parentId).toBeUndefined();
    });
  });

  describe('updateProductCategorySchema', () => {
    it('accepts an empty body', () => {
      const result = updateProductCategorySchema.parse({ params: { id: 'cat-1' }, body: {} });
      expect(result.body).toEqual({});
    });

    it('accepts a null icon (explicit clear)', () => {
      const result = updateProductCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { icon: null },
      });
      expect(result.body.icon).toBeNull();
    });

    it('accepts a null parentId (explicit clear, e.g. promote to top-level)', () => {
      const result = updateProductCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { parentId: null },
      });
      expect(result.body.parentId).toBeNull();
    });

    it('accepts an isActive boolean toggle', () => {
      const result = updateProductCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { isActive: false },
      });
      expect(result.body.isActive).toBe(false);
    });

    it('rejects a non-boolean isActive value', () => {
      expect(() =>
        updateProductCategorySchema.parse({
          params: { id: 'cat-1' },
          body: { isActive: 'yes' },
        })
      ).toThrow();
    });

    it('rejects an invalid slug format on update', () => {
      expect(() =>
        updateProductCategorySchema.parse({
          params: { id: 'cat-1' },
          body: { slug: 'Invalid Slug' },
        })
      ).toThrow();
    });

    it('requires a non-empty id in params', () => {
      expect(() =>
        updateProductCategorySchema.parse({ params: { id: '' }, body: {} })
      ).toThrow();
    });
  });

  describe('productCategoryIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = productCategoryIdSchema.parse({ params: { id: 'cat-1' } });
      expect(result.params.id).toBe('cat-1');
    });

    it('rejects an empty id', () => {
      expect(() => productCategoryIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
