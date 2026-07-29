import {
  adminGetAdsSchema,
  adminGetUsersSchema,
  setFeaturedSchema,
  setPinnedSchema,
  toggleActiveSchema,
  changeRoleSchema,
} from '../../src/modules/admin/admin.validation';

describe('admin.validation — additional coverage', () => {
  describe('adminGetAdsSchema — pagination and filters', () => {
    it('accepts an empty query', () => {
      expect(() => adminGetAdsSchema.parse({ query: {} })).not.toThrow();
    });

    it('coerces page/limit query strings to numbers', () => {
      const result = adminGetAdsSchema.parse({ query: { page: '2', limit: '50' } });
      expect(result.query.page).toBe(2);
      expect(result.query.limit).toBe(50);
    });

    it('rejects a limit above the maximum of 100', () => {
      expect(() => adminGetAdsSchema.parse({ query: { limit: '101' } })).toThrow();
    });

    it('rejects a page below the minimum of 1', () => {
      expect(() => adminGetAdsSchema.parse({ query: { page: '0' } })).toThrow();
    });

    it('accepts a valid status filter', () => {
      const result = adminGetAdsSchema.parse({ query: { status: 'ACTIVE' } });
      expect(result.query.status).toBe('ACTIVE');
    });

    it('rejects an invalid status filter', () => {
      expect(() => adminGetAdsSchema.parse({ query: { status: 'BOGUS' } })).toThrow();
    });

    it('accepts an arbitrary userId string filter', () => {
      const result = adminGetAdsSchema.parse({ query: { userId: 'user-1' } });
      expect(result.query.userId).toBe('user-1');
    });
  });

  describe('adminGetUsersSchema — pagination', () => {
    it('accepts an empty query', () => {
      expect(() => adminGetUsersSchema.parse({ query: {} })).not.toThrow();
    });

    it('coerces page/limit query strings to numbers', () => {
      const result = adminGetUsersSchema.parse({ query: { page: '3', limit: '10' } });
      expect(result.query.page).toBe(3);
      expect(result.query.limit).toBe(10);
    });

    it('rejects a limit above the maximum of 100', () => {
      expect(() => adminGetUsersSchema.parse({ query: { limit: '101' } })).toThrow();
    });
  });

  describe('setFeaturedSchema', () => {
    it('accepts a boolean isFeatured', () => {
      expect(() => setFeaturedSchema.parse({ body: { isFeatured: true } })).not.toThrow();
      expect(() => setFeaturedSchema.parse({ body: { isFeatured: false } })).not.toThrow();
    });

    it('rejects a missing isFeatured', () => {
      expect(() => setFeaturedSchema.parse({ body: {} })).toThrow();
    });

    it('rejects a non-boolean isFeatured (string "true" from a raw query is not coerced)', () => {
      expect(() => setFeaturedSchema.parse({ body: { isFeatured: 'true' } })).toThrow();
    });
  });

  describe('setPinnedSchema', () => {
    it('accepts a boolean isPinned', () => {
      expect(() => setPinnedSchema.parse({ body: { isPinned: true } })).not.toThrow();
    });

    it('rejects a missing isPinned', () => {
      expect(() => setPinnedSchema.parse({ body: {} })).toThrow();
    });
  });

  describe('toggleActiveSchema', () => {
    it('accepts a boolean isActive', () => {
      expect(() => toggleActiveSchema.parse({ body: { isActive: false } })).not.toThrow();
    });

    it('rejects a missing isActive', () => {
      expect(() => toggleActiveSchema.parse({ body: {} })).toThrow();
    });
  });

  describe('changeRoleSchema', () => {
    it('accepts USER and ADMIN as valid roles', () => {
      expect(() => changeRoleSchema.parse({ body: { role: 'USER' } })).not.toThrow();
      expect(() => changeRoleSchema.parse({ body: { role: 'ADMIN' } })).not.toThrow();
    });

    it('rejects an unrecognized role', () => {
      expect(() => changeRoleSchema.parse({ body: { role: 'SUPERADMIN' } })).toThrow();
    });

    it('rejects a missing role', () => {
      expect(() => changeRoleSchema.parse({ body: {} })).toThrow();
    });
  });
});
