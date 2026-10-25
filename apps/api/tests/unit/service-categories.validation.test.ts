import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  serviceCategoryIdSchema,
} from '../../src/modules/service-categories/service-categories.validation';

describe('service-categories.validation', () => {
  describe('createServiceCategorySchema', () => {
    const valid = { name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' };

    it('accepts a minimal valid payload', () => {
      const result = createServiceCategorySchema.parse({ body: valid });
      expect(result.body.name).toBe('Plumbing');
    });

    it('accepts optional icon and parentId', () => {
      const result = createServiceCategorySchema.parse({
        body: { ...valid, icon: 'wrench', parentId: 'parent-1' },
      });
      expect(result.body.icon).toBe('wrench');
      expect(result.body.parentId).toBe('parent-1');
    });

    it('rejects a slug with uppercase letters', () => {
      expect(() =>
        createServiceCategorySchema.parse({ body: { ...valid, slug: 'Plumbing' } })
      ).toThrow(/Slug must be lowercase/);
    });

    it('rejects a slug with spaces', () => {
      expect(() =>
        createServiceCategorySchema.parse({ body: { ...valid, slug: 'home plumbing' } })
      ).toThrow(/Slug must be lowercase/);
    });

    it('rejects a slug with special characters', () => {
      expect(() =>
        createServiceCategorySchema.parse({ body: { ...valid, slug: 'plumbing!' } })
      ).toThrow(/Slug must be lowercase/);
    });

    it('accepts a slug with hyphens and numbers', () => {
      const result = createServiceCategorySchema.parse({
        body: { ...valid, slug: 'home-plumbing-24-7' },
      });
      expect(result.body.slug).toBe('home-plumbing-24-7');
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => createServiceCategorySchema.parse({ body: { ...valid, name: 'P' } })).toThrow();
    });

    it('rejects a name longer than 100 characters', () => {
      expect(() =>
        createServiceCategorySchema.parse({ body: { ...valid, name: 'x'.repeat(101) } })
      ).toThrow();
    });

    it('rejects a missing nameAr', () => {
      const { nameAr, ...withoutNameAr } = valid;
      expect(() => createServiceCategorySchema.parse({ body: withoutNameAr })).toThrow();
    });
  });

  describe('updateServiceCategorySchema', () => {
    it('accepts an empty body (all fields optional)', () => {
      const result = updateServiceCategorySchema.parse({ params: { id: 'cat-1' }, body: {} });
      expect(result.body).toEqual({});
    });

    it('accepts a null icon (explicit clear)', () => {
      const result = updateServiceCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { icon: null },
      });
      expect(result.body.icon).toBeNull();
    });

    it('accepts a null parentId (moving to top-level)', () => {
      const result = updateServiceCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { parentId: null },
      });
      expect(result.body.parentId).toBeNull();
    });

    it('accepts a boolean isActive', () => {
      const result = updateServiceCategorySchema.parse({
        params: { id: 'cat-1' },
        body: { isActive: false },
      });
      expect(result.body.isActive).toBe(false);
    });

    it('rejects an invalid slug format even when optional', () => {
      expect(() =>
        updateServiceCategorySchema.parse({ params: { id: 'cat-1' }, body: { slug: 'Bad Slug' } })
      ).toThrow();
    });

    it('rejects a missing id param', () => {
      expect(() => updateServiceCategorySchema.parse({ params: {}, body: {} })).toThrow();
    });
  });

  describe('serviceCategoryIdSchema', () => {
    it('accepts a non-empty id', () => {
      const result = serviceCategoryIdSchema.parse({ params: { id: 'cat-1' } });
      expect(result.params.id).toBe('cat-1');
    });

    it('rejects an empty id', () => {
      expect(() => serviceCategoryIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });
});
