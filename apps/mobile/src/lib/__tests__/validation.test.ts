import { describe, expect, it } from 'vitest';
import {
  adDraftSchema,
  adEditorSchema,
  emailSchema,
  firstZodError,
  homeFilterSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  validate,
} from '../validation';

describe('shared form validation schemas', () => {
  it('trims email whitespace and rejects malformed or blank addresses', () => {
    expect(emailSchema.parse('  seller@example.com  ')).toBe('seller@example.com');
    expect(emailSchema.safeParse('   ').success).toBe(false);
    expect(emailSchema.safeParse('seller@').success).toBe(false);
  });

  it('enforces the minimum password length without silently trimming it', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse(' 123456 ').success).toBe(true);
  });

  it('requires both login fields and returns normalized email', () => {
    expect(loginSchema.safeParse({ email: ' user@example.com ', password: 'x' })).toMatchObject({
      success: true,
      data: { email: 'user@example.com', password: 'x' },
    });
    expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
  });

  it('accepts optional empty phone and city values during registration', () => {
    expect(registerSchema.safeParse({
      name: ' Seller ', email: ' seller@example.com ', password: '12345678', phone: '', city: '',
    })).toMatchObject({ success: true, data: { name: 'Seller', email: 'seller@example.com' } });
  });

  it('rejects too-short names and names longer than the supported limit', () => {
    const base = { email: 'a@b.com', password: '12345678' };
    expect(registerSchema.safeParse({ ...base, name: 'A' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, name: 'N'.repeat(81) }).success).toBe(false);
  });

  it('allows a draft without a price but rejects negative and non-numeric prices', () => {
    expect(adDraftSchema.safeParse({ title: ' Good title ', price: '' }).success).toBe(true);
    expect(adDraftSchema.safeParse({ title: 'Good title', price: '-1' }).success).toBe(false);
    expect(adDraftSchema.safeParse({ title: 'Good title', price: 'abc' }).success).toBe(false);
  });

  it('requires a complete editor description and a positive price with at most two decimals', () => {
    const valid = { title: 'Good title', description: 'A sufficiently detailed description', city: 'Gaza', price: '12.50' };
    expect(adEditorSchema.safeParse(valid).success).toBe(true);
    expect(adEditorSchema.safeParse({ ...valid, description: 'short' }).success).toBe(false);
    expect(adEditorSchema.safeParse({ ...valid, price: '0' }).success).toBe(false);
    expect(adEditorSchema.safeParse({ ...valid, price: '12.345' }).success).toBe(false);
  });

  it('validates non-negative numeric home price filters and their ordering', () => {
    expect(homeFilterSchema.safeParse({ city: ' Gaza ', minPrice: '10', maxPrice: '20' }).success).toBe(true);
    expect(homeFilterSchema.safeParse({ minPrice: '-1' }).success).toBe(false);
    expect(homeFilterSchema.safeParse({ maxPrice: 'many' }).success).toBe(false);
    expect(homeFilterSchema.safeParse({ minPrice: '30', maxPrice: '20' }).success).toBe(false);
  });

  it('returns the first localized validation issue through validate()', () => {
    const result = validate(emailSchema, 'not-an-email');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('صيغة البريد غير صحيحة');
  });

  it('uses a safe fallback when a Zod error has no issue message', () => {
    expect(firstZodError({ issues: [] } as never)).toBe('تحقق من الحقول المدخلة');
  });
});
