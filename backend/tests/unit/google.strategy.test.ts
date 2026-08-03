/**
 * FIX OAUTH-01 coverage.
 *
 * env.ts reads process.env once at module-load time (see
 * env.redisPassword.test.ts's own comment on this), so toggling
 * GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL between tests requires the same
 * jest.resetModules() + dynamic re-import pattern used there — a
 * plain `process.env.X = ...` after config/env.ts has already been
 * imported once would have no effect on the already-frozen `env`
 * export.
 */

import { Profile } from 'passport-google-oauth20';

describe('google.strategy', () => {
  describe('extractGoogleProfile', () => {
    // Imported fresh per describe block since it doesn't depend on env
    // state, but re-importing via the same dynamic pattern keeps this
    // file internally consistent and avoids relying on Jest's
    // module-registry caching behavior across files.
    let extractGoogleProfile: typeof import('../../src/modules/auth/google.strategy').extractGoogleProfile;

    beforeAll(async () => {
      ({ extractGoogleProfile } = await import('../../src/modules/auth/google.strategy'));
    });

    function buildProfile(overrides: Partial<Profile> = {}): Profile {
      return {
        id: 'google-user-123',
        displayName: 'Ahmad Test',
        emails: [{ value: 'ahmad@example.com', verified: true }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
        provider: 'google',
        ...overrides,
      } as unknown as Profile;
    }

    it('extracts googleId, email, name, and avatarUrl from a full profile', () => {
      const result = extractGoogleProfile(buildProfile());
      expect(result).toEqual({
        googleId: 'google-user-123',
        email: 'ahmad@example.com',
        name: 'Ahmad Test',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
    });

    it('lowercases the email', () => {
      const result = extractGoogleProfile(
        buildProfile({ emails: [{ value: 'Ahmad@Example.COM', verified: true }] })
      );
      expect(result.email).toBe('ahmad@example.com');
    });

    it('prefers a verified email over an unverified one when multiple are present', () => {
      const result = extractGoogleProfile(
        buildProfile({
          emails: [
            { value: 'unverified@example.com', verified: false },
            { value: 'verified@example.com', verified: true },
          ],
        })
      );
      expect(result.email).toBe('verified@example.com');
    });

    it('falls back to the first email if none are explicitly marked verified', () => {
      const result = extractGoogleProfile(
        buildProfile({ emails: [{ value: 'only@example.com', verified: undefined as unknown as boolean }] })
      );
      expect(result.email).toBe('only@example.com');
    });

    it('throws if the Google profile has no email at all', () => {
      expect(() => extractGoogleProfile(buildProfile({ emails: [] }))).toThrow(
        'Google account has no accessible email address'
      );
    });

    it('falls back to the email local-part as the name when displayName is blank', () => {
      const result = extractGoogleProfile(buildProfile({ displayName: '  ' }));
      expect(result.name).toBe('ahmad');
    });

    it('omits avatarUrl when the profile has no photos', () => {
      const result = extractGoogleProfile(buildProfile({ photos: [] }));
      expect(result.avatarUrl).toBeUndefined();
    });
  });

  describe('configureGoogleStrategy', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      jest.resetModules();
    });

    it('does not register the strategy and logs a warning when Google OAuth env vars are missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CALLBACK_URL;
      jest.resetModules();

      const { configureGoogleStrategy, passport } = await import('../../src/modules/auth/google.strategy');
      const useSpy = jest.spyOn(passport, 'use');
      const { logger } = await import('../../src/shared/utils/logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

      configureGoogleStrategy();

      expect(useSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Google OAuth is not configured'));

      useSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('registers the strategy when all three Google OAuth env vars are present', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/v1/auth/google/callback';
      jest.resetModules();

      const { configureGoogleStrategy, passport } = await import('../../src/modules/auth/google.strategy');
      const useSpy = jest.spyOn(passport, 'use');

      configureGoogleStrategy();

      expect(useSpy).toHaveBeenCalledTimes(1);
      expect((useSpy.mock.calls[0][0] as unknown as { name: string }).name).toBe('google');

      useSpy.mockRestore();
    });

    it('does not register the strategy when only some Google OAuth env vars are present', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      delete process.env.GOOGLE_CLIENT_SECRET;
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/v1/auth/google/callback';
      jest.resetModules();

      const { configureGoogleStrategy, passport } = await import('../../src/modules/auth/google.strategy');
      const useSpy = jest.spyOn(passport, 'use');

      configureGoogleStrategy();

      expect(useSpy).not.toHaveBeenCalled();

      useSpy.mockRestore();
    });
  });
});
