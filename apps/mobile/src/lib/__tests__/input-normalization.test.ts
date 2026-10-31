import { describe, expect, it } from 'vitest';
import { normalizeNumericInput } from '../normalize-numeric-input';
import { getSafeAuthRedirect } from '../safe-auth-redirect';

describe('normalizeNumericInput', () => {
  it('converts Arabic and Persian digits and Arabic decimal separators', () => {
    expect(normalizeNumericInput('١٢٣٫٤٥')).toBe('123.45');
    expect(normalizeNumericInput('۱۲۳،۴۵')).toBe('123.45');
  });

  it('removes grouping separators and invisible spacing without damaging a plus sign', () => {
    expect(normalizeNumericInput('+٩٧٠ ٥٩٬١٢٣٤٥٦٧')).toBe('+970591234567');
  });
});

describe('getSafeAuthRedirect', () => {
  it('accepts an internal app route and keeps its query string', () => {
    expect(getSafeAuthRedirect('/order-checkout?productId=abc')).toBe('/order-checkout?productId=abc');
  });

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/login',
    '/register?redirect=/admin',
    '/x\u0000y',
  ])('rejects unsafe redirect %s', (value) => {
    expect(getSafeAuthRedirect(value)).toBeNull();
  });

  it('rejects oversized and array-empty inputs', () => {
    expect(getSafeAuthRedirect('a'.repeat(2049))).toBeNull();
    expect(getSafeAuthRedirect([])).toBeNull();
  });
});
