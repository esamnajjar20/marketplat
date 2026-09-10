/**
 * __tests__/unit/lib/smartScanParse.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeDigits,
  isValidPalMobile,
  normalizePalMobile,
  normalizePersonName,
  extractPhone,
  smartParsePay,
  smartParseCard,
  looksLikeCard,
} from '@/lib/smartScanParse';

describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits', () => {
    expect(normalizeDigits('٠٥٩١٢٣٤٥٦٧')).toBe('0591234567');
  });
  it('leaves latin digits', () => {
    expect(normalizeDigits('0591234567')).toBe('0591234567');
  });
});

describe('isValidPalMobile / normalizePalMobile', () => {
  it('accepts 059 and 056 numbers', () => {
    expect(isValidPalMobile('0591234567')).toBe(true);
    expect(isValidPalMobile('0561234567')).toBe(true);
    expect(isValidPalMobile('059123456')).toBe(false);
    expect(isValidPalMobile('0501234567')).toBe(false);
  });
  it('prefixes missing leading zero', () => {
    expect(normalizePalMobile('591234567')).toBe('0591234567');
    expect(normalizePalMobile('561234567')).toBe('0561234567');
  });
});

describe('normalizePersonName', () => {
  it('strips diacritics and collapses spaces', () => {
    expect(normalizePersonName('  أحمد   محمد  ')).toBe('أحمد محمد');
  });
});

describe('extractPhone', () => {
  it('finds 059 number in free text', () => {
    expect(extractPhone('اتصل على 059-123-4567 الآن')).toBe('0591234567');
  });
  it('returns empty when no mobile', () => {
    expect(extractPhone('لا يوجد رقم')).toBe('');
  });
});

describe('smartParsePay', () => {
  it('extracts name and number from labeled text', () => {
    const r = smartParsePay('الاسم: أحمد علي\nالجوال: 0591234567');
    // PayParseResult uses `number`, not `phone`
    expect(r.number).toContain('0591234567');
    expect(r.name).toMatch(/أحمد/);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('extracts phone-only QR payload into number', () => {
    const r = smartParsePay('0599876543');
    expect(r.number).toContain('0599876543');
  });
});

describe('smartParseCard', () => {
  it('parses username and password digit runs', () => {
    const r = smartParseCard('اسم المستخدم: 123456\nكلمة السر: 654321');
    expect(r.username).toBe('123456');
    expect(r.password).toBe('654321');
  });

  it('looksLikeCard detects labeled or dual digit runs', () => {
    expect(looksLikeCard('username: 1111\npassword: 2222')).toBe(true);
    expect(looksLikeCard('12345678 87654321')).toBe(true);
    expect(looksLikeCard('hello world')).toBe(false);
  });
});
