import {
  getUserByIdSchema,
  changePasswordSchema,
  updateNotificationPreferencesSchema,
} from '../../src/modules/users/users.validation';

describe('users.validation — additional schemas', () => {
  describe('getUserByIdSchema', () => {
    it('accepts a non-empty id param', () => {
      expect(() => getUserByIdSchema.parse({ params: { id: 'user-1' } })).not.toThrow();
    });

    it('rejects an empty id param', () => {
      expect(() => getUserByIdSchema.parse({ params: { id: '' } })).toThrow();
    });
  });

  describe('changePasswordSchema', () => {
    const valid = { currentPassword: 'old-password', newPassword: 'newPassword123' };

    it('accepts valid current/new passwords', () => {
      expect(() => changePasswordSchema.parse({ body: valid })).not.toThrow();
    });

    it('rejects an empty currentPassword', () => {
      expect(() =>
        changePasswordSchema.parse({ body: { ...valid, currentPassword: '' } })
      ).toThrow();
    });

    it('rejects a newPassword shorter than 8 characters', () => {
      expect(() =>
        changePasswordSchema.parse({ body: { ...valid, newPassword: 'short1' } })
      ).toThrow();
    });

    it('rejects a newPassword longer than 100 characters', () => {
      expect(() =>
        changePasswordSchema.parse({ body: { ...valid, newPassword: 'A'.repeat(101) } })
      ).toThrow();
    });

    it('accepts a newPassword of exactly 8 characters (boundary)', () => {
      expect(() =>
        changePasswordSchema.parse({ body: { ...valid, newPassword: 'A1234567' } })
      ).not.toThrow();
    });

    it('rejects a missing newPassword', () => {
      expect(() =>
        changePasswordSchema.parse({ body: { currentPassword: 'old-password' } })
      ).toThrow();
    });
  });

  describe('updateNotificationPreferencesSchema', () => {
    it('accepts a single preference toggle', () => {
      const result = updateNotificationPreferencesSchema.parse({ body: { promotions: true } });
      expect(result.body).toEqual({ promotions: true });
    });

    it('accepts all four preference keys together', () => {
      const body = { newMessage: true, adViews: false, favAdUpdated: true, promotions: false };
      const result = updateNotificationPreferencesSchema.parse({ body });
      expect(result.body).toEqual(body);
    });

    it('rejects an empty body (at least one preference required)', () => {
      expect(() => updateNotificationPreferencesSchema.parse({ body: {} })).toThrow(
        'At least one preference must be provided'
      );
    });

    it('rejects a non-boolean value for a known preference key', () => {
      expect(() =>
        updateNotificationPreferencesSchema.parse({ body: { promotions: 'yes' } })
      ).toThrow();
    });
  });
});
