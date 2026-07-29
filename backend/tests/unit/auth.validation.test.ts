import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../src/modules/auth/auth.validation';

describe('auth.validation', () => {
  describe('registerSchema', () => {
    const valid = { name: 'Test User', email: 'test@example.com', password: 'Password123' };

    it('accepts a valid body with only required fields', () => {
      expect(() => registerSchema.parse({ body: valid })).not.toThrow();
    });

    it('accepts optional phone and city when provided', () => {
      const result = registerSchema.parse({
        body: { ...valid, phone: '+966501234567', city: 'Riyadh' },
      });
      expect(result.body.phone).toBe('+966501234567');
      expect(result.body.city).toBe('Riyadh');
    });

    it('rejects a name shorter than 2 characters', () => {
      expect(() => registerSchema.parse({ body: { ...valid, name: 'A' } })).toThrow();
    });

    it('rejects a name longer than 100 characters', () => {
      expect(() => registerSchema.parse({ body: { ...valid, name: 'A'.repeat(101) } })).toThrow();
    });

    it('rejects an invalid email format', () => {
      expect(() => registerSchema.parse({ body: { ...valid, email: 'not-an-email' } })).toThrow();
    });

    it('rejects a password shorter than 8 characters', () => {
      expect(() => registerSchema.parse({ body: { ...valid, password: 'short1' } })).toThrow();
    });

    it('rejects a password longer than 100 characters', () => {
      expect(() =>
        registerSchema.parse({ body: { ...valid, password: 'A'.repeat(101) } })
      ).toThrow();
    });

    it('rejects an invalid phone format', () => {
      expect(() => registerSchema.parse({ body: { ...valid, phone: 'not-a-phone' } })).toThrow();
    });

    it('rejects a city longer than 100 characters', () => {
      expect(() => registerSchema.parse({ body: { ...valid, city: 'A'.repeat(101) } })).toThrow();
    });
  });

  describe('loginSchema', () => {
    it('accepts a valid email and non-empty password', () => {
      expect(() =>
        loginSchema.parse({ body: { email: 'test@example.com', password: 'anything' } })
      ).not.toThrow();
    });

    it('rejects an invalid email format', () => {
      expect(() =>
        loginSchema.parse({ body: { email: 'not-an-email', password: 'anything' } })
      ).toThrow();
    });

    it('rejects an empty password', () => {
      expect(() =>
        loginSchema.parse({ body: { email: 'test@example.com', password: '' } })
      ).toThrow();
    });

    it('does not enforce a minimum length on password beyond non-empty (unlike registerSchema)', () => {
      expect(() =>
        loginSchema.parse({ body: { email: 'test@example.com', password: 'x' } })
      ).not.toThrow();
    });
  });

  describe('forgotPasswordSchema', () => {
    it('accepts a valid email', () => {
      expect(() => forgotPasswordSchema.parse({ body: { email: 'test@example.com' } })).not.toThrow();
    });

    it('rejects an invalid email format', () => {
      expect(() => forgotPasswordSchema.parse({ body: { email: 'not-an-email' } })).toThrow();
    });

    it('rejects a missing email', () => {
      expect(() => forgotPasswordSchema.parse({ body: {} })).toThrow();
    });
  });

  describe('resetPasswordSchema', () => {
    const valid = { token: 'reset-token-abc', newPassword: 'NewPassword123' };

    it('accepts a valid token and newPassword', () => {
      expect(() => resetPasswordSchema.parse({ body: valid })).not.toThrow();
    });

    it('rejects an empty token', () => {
      expect(() => resetPasswordSchema.parse({ body: { ...valid, token: '' } })).toThrow();
    });

    it('rejects a newPassword shorter than 8 characters', () => {
      expect(() =>
        resetPasswordSchema.parse({ body: { ...valid, newPassword: 'short1' } })
      ).toThrow();
    });

    it('rejects a newPassword longer than 100 characters', () => {
      expect(() =>
        resetPasswordSchema.parse({ body: { ...valid, newPassword: 'A'.repeat(101) } })
      ).toThrow();
    });
  });
});
