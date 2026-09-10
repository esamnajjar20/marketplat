/**
 * __tests__/unit/lib/ocrCardScan.test.ts
 * Pure helpers only — skip real Canvas2D (jsdom often returns null ctx).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeCardDigits,
  isValidCardUsername,
  isValidCardPassword,
  normalizePayPhone,
  isValidPayPhone,
  normalizePayName,
  scorePayNameQuality,
  looksLikeOcrCard,
  consensusCardFields,
  consensusPayFields,
} from '@/lib/ocrCardScan';

describe('normalizeCardDigits / validators', () => {
  it('normalizes arabic digits', () => {
    expect(normalizeCardDigits('١٢٣٤')).toMatch(/1234/);
  });
  it('validates username/password length bounds', () => {
    expect(isValidCardUsername('123456')).toBe(true);
    expect(isValidCardUsername('')).toBe(false);
    expect(isValidCardPassword('999999')).toBe(true);
  });
});

describe('pay phone/name helpers', () => {
  it('normalizes and validates pay phone', () => {
    expect(normalizePayPhone('591234567')).toBe('0591234567');
    expect(isValidPayPhone('0591234567')).toBe(true);
    expect(isValidPayPhone('0501234567')).toBe(false);
  });
  it('normalizes Arabic name variants', () => {
    const n = normalizePayName('أحمد  محمد');
    expect(n.length).toBeGreaterThan(0);
  });
  it('scores name quality', () => {
    expect(scorePayNameQuality('')).toBe(0);
    expect(scorePayNameQuality('أحمد محمد')).toBeGreaterThan(0);
  });
});

describe('looksLikeOcrCard', () => {
  it('true for long digit strings', () => {
    expect(looksLikeOcrCard('12345678')).toBe(true);
  });
  it('false for plain words', () => {
    expect(looksLikeOcrCard('hello')).toBe(false);
  });
});

describe('consensus helpers', () => {
  it('consensusCardFields prefers matching candidates', () => {
    const r = consensusCardFields([
      { username: '111111', password: '222222' },
      { username: '111111', password: '222222' },
    ]);
    expect(r.username).toBe('111111');
    expect(r.password).toBe('222222');
    expect(r.verified).toBe(true);
  });

  it('consensusPayFields aggregates samples', () => {
    const r = consensusPayFields([
      { name: 'أحمد', phone: '0591234567' },
      { name: 'أحمد', phone: '0591234567' },
    ]);
    expect(r.phone).toBe('0591234567');
    expect(r.name).toMatch(/أحمد/);
  });
});
