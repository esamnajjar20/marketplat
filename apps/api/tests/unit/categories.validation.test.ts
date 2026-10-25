import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
} from '../../src/modules/categories/categories.validation';

describe('categories.validation', () => {
  describe('createCategorySchema', () => {
    const valid = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' };

    it('accepts a fully valid body', () => {
      expect(() => createCategorySchema.parse({ body: valid })).not.toThrow();
    });

    it('accepts an optional parentId', () => {
      const result = createCategorySchema.parse({ body: { ...valid, parentId: 'parent-1' } });
      expect(result.body.parentId).toBe('parent-1');
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => createCategorySchema.parse({ body: { ...valid, name: 'A' } })).toThrow();
    });

    it('rejects a name longer than 100 characters', () => {
      expect(() =>
        createCategorySchema.parse({ body: { ...valid, name: 'A'.repeat(101) } })
      ).toThrow();
    });

    it('rejects a nameAr shorter than 2 characters', () => {
      expect(() => createCategorySchema.parse({ body: { ...valid, nameAr: 'أ' } })).toThrow();
    });

    it('accepts a slug of lowercase letters, numbers, and hyphens', () => {
      expect(() =>
        createCategorySchema.parse({ body: { ...valid, slug: 'home-and-garden-2' } })
      ).not.toThrow();
    });

    it('rejects a slug with uppercase letters', () => {
      expect(() => createCategorySchema.parse({ body: { ...valid, slug: 'Electronics' } })).toThrow();
    });

    it('rejects a slug with spaces', () => {
      expect(() =>
        createCategorySchema.parse({ body: { ...valid, slug: 'home garden' } })
      ).toThrow();
    });

    it('rejects a slug with special characters', () => {
      expect(() =>
        createCategorySchema.parse({ body: { ...valid, slug: 'electronics!' } })
      ).toThrow();
    });

    it('rejects a slug shorter than 2 characters', () => {
      expect(() => createCategorySchema.parse({ body: { ...valid, slug: 'a' } })).toThrow();
    });
  });

  describe('updateCategorySchema', () => {
    const validParams = { id: 'cat-1' };

    it('accepts an empty body (all fields optional)', () => {
      expect(() => updateCategorySchema.parse({ params: validParams, body: {} })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => updateCategorySchema.parse({ params: { id: '' }, body: {} })).toThrow();
    });

    it('accepts a partial update of a single field', () => {
      const result = updateCategorySchema.parse({ params: validParams, body: { name: 'New Name' } });
      expect(result.body).toEqual({ name: 'New Name' });
    });

    it('validates slug format the same way createCategorySchema does', () => {
      expect(() =>
        updateCategorySchema.parse({ params: validParams, body: { slug: 'Invalid Slug' } })
      ).toThrow();
    });

    it('allows parentId to be explicitly nulled (unlike createCategorySchema)', () => {
      const result = updateCategorySchema.parse({ params: validParams, body: { parentId: null } });
      expect(result.body.parentId).toBeNull();
    });
  });

  describe('categoryIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => categoryIdSchema.parse({ params: { id: 'cat-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => categoryIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
