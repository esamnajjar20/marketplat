import { adminGetAdsSchema, adminGetUsersSchema } from '../../src/modules/admin/admin.validation';

describe('admin.validation', () => {
  it('parses isActive=true query param', () => {
    const result = adminGetUsersSchema.parse({ query: { isActive: 'true' } });
    expect(result.query.isActive).toBe(true);
  });

  it('parses isActive=false query param', () => {
    const result = adminGetUsersSchema.parse({ query: { isActive: 'false' } });
    expect(result.query.isActive).toBe(false);
  });

  // BUGFIX: `q` was previously undeclared on both admin query schemas,
  // so Zod silently stripped it before it ever reached admin.service.ts
  // — the search boxes in AdminAdsTable/AdminUsersTable looked
  // functional but filtered nothing.
  describe('q (search) field', () => {
    it('adminGetAdsSchema accepts and passes through a q value', () => {
      const result = adminGetAdsSchema.parse({ query: { q: 'iphone' } });
      expect(result.query.q).toBe('iphone');
    });

    it('adminGetAdsSchema trims surrounding whitespace from q', () => {
      const result = adminGetAdsSchema.parse({ query: { q: '  iphone  ' } });
      expect(result.query.q).toBe('iphone');
    });

    it('adminGetAdsSchema rejects an empty q after trimming', () => {
      expect(() => adminGetAdsSchema.parse({ query: { q: '   ' } })).toThrow();
    });

    it('adminGetAdsSchema rejects a q longer than 200 characters', () => {
      expect(() => adminGetAdsSchema.parse({ query: { q: 'a'.repeat(201) } })).toThrow();
    });

    it('adminGetAdsSchema treats q as optional', () => {
      const result = adminGetAdsSchema.parse({ query: {} });
      expect(result.query.q).toBeUndefined();
    });

    it('adminGetUsersSchema accepts and passes through a q value', () => {
      const result = adminGetUsersSchema.parse({ query: { q: 'ahmad' } });
      expect(result.query.q).toBe('ahmad');
    });

    it('adminGetUsersSchema trims surrounding whitespace from q', () => {
      const result = adminGetUsersSchema.parse({ query: { q: '  ahmad  ' } });
      expect(result.query.q).toBe('ahmad');
    });

    it('adminGetUsersSchema rejects an empty q after trimming', () => {
      expect(() => adminGetUsersSchema.parse({ query: { q: '   ' } })).toThrow();
    });

    it('adminGetUsersSchema rejects a q longer than 200 characters', () => {
      expect(() => adminGetUsersSchema.parse({ query: { q: 'a'.repeat(201) } })).toThrow();
    });

    it('adminGetUsersSchema treats q as optional', () => {
      const result = adminGetUsersSchema.parse({ query: {} });
      expect(result.query.q).toBeUndefined();
    });
  });
});
