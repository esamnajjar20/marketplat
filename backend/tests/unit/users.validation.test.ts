import { updateProfileSchema } from '../../src/modules/users/users.validation';

describe('users.validation', () => {
  describe('updateProfileSchema', () => {
    it('accepts valid profile fields', () => {
      const result = updateProfileSchema.parse({
        body: { name: 'Updated Name', city: 'الرياض', phone: '+966501234567' },
      });
      expect(result.body.name).toBe('Updated Name');
    });

    it('rejects invalid phone format', () => {
      expect(() =>
        updateProfileSchema.parse({ body: { phone: 'not-a-phone' } })
      ).toThrow();
    });

    // L-6 (audit fix): avatarUrl removed from updateProfileSchema (dead
    // field — see the comment in users.validation.ts for why). The two
    // tests that used to live here ('rejects avatar URL from disallowed
    // domain' / 'accepts cloudinary avatar URL') tested validation logic
    // that no longer exists. Replaced with a test that pins down the
    // new contract instead: Zod's default (non-strict) object parsing
    // silently strips unknown keys rather than rejecting them, so a
    // client that still sends avatarUrl won't get an error — it'll just
    // be dropped, same as any other unrecognized field. Avatar updates
    // must go through POST /users/me/avatar.
    it('ignores avatarUrl if a client still sends it (dead field, silently dropped)', () => {
      const result = updateProfileSchema.parse({
        body: { name: 'Updated Name', avatarUrl: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg' },
      });
      expect(result.body.name).toBe('Updated Name');
      expect((result.body as Record<string, unknown>).avatarUrl).toBeUndefined();
    });
  });
});
