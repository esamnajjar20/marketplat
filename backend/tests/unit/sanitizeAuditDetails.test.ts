import { sanitizeAuditDetails } from '../../src/shared/utils/sanitizeAuditDetails';

describe('sanitizeAuditDetails', () => {
  it('returns undefined when given undefined', () => {
    expect(sanitizeAuditDetails(undefined)).toBeUndefined();
  });

  it('returns an empty object unchanged', () => {
    expect(sanitizeAuditDetails({})).toEqual({});
  });

  it('redacts keys matching common sensitive-field names, case-insensitively', () => {
    const input = {
      password: 'x',
      Password: 'x',
      newPassword: 'x',
      token: 'x',
      refreshToken: 'x',
      secret: 'x',
      apiKey: 'x',
      api_key: 'x',
      cardNumber: 'x',
      cvv: 'x',
      cvc: 'x',
      otp: 'x',
      pin: 'x',
      ssn: 'x',
    };

    const result = sanitizeAuditDetails(input);

    for (const key of Object.keys(input)) {
      expect(result![key]).toBe('[REDACTED]');
    }
  });

  it('leaves non-sensitive keys and their original values untouched', () => {
    const input = { storeId: 'store-1', newRole: 'ADMIN', count: 3, active: true, note: null };
    expect(sanitizeAuditDetails(input)).toEqual(input);
  });

  it('only redacts the matching keys in a mixed object', () => {
    const input = { userId: 'user-1', password: 'secret-value', reason: 'user-initiated' };
    expect(sanitizeAuditDetails(input)).toEqual({
      userId: 'user-1',
      password: '[REDACTED]',
      reason: 'user-initiated',
    });
  });
});
