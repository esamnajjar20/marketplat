import { describe, it, expect } from 'vitest';
import { toWaPhone, buildWhatsAppUrl } from '@/lib/whatsapp';

describe('toWaPhone', () => {
  it('adds the 970 country code to local 0-prefixed numbers', () => {
    expect(toWaPhone('0599-123-456')).toBe('970599123456');
  });
  it('keeps numbers that already start with 970 and strips symbols', () => {
    expect(toWaPhone('+970 599 123 456')).toBe('970599123456');
  });
  it('returns an empty string for missing input', () => {
    expect(toWaPhone(null)).toBe('');
    expect(toWaPhone(undefined)).toBe('');
    expect(toWaPhone('abc')).toBe('');
  });
});

describe('buildWhatsAppUrl', () => {
  it('builds a direct chat link with encoded text', () => {
    expect(buildWhatsAppUrl({ phone: '0599123456', text: 'مرحبا بك' })).toBe(
      `https://wa.me/970599123456?text=${encodeURIComponent('مرحبا بك')}`,
    );
  });
  it('falls back to the recipient-picker link when there is no phone', () => {
    expect(buildWhatsAppUrl({ text: 'hi' })).toBe('https://wa.me/?text=hi');
    expect(buildWhatsAppUrl({ phone: '', text: 'hi' })).toBe('https://wa.me/?text=hi');
  });
  it('omits the query string when there is no text', () => {
    expect(buildWhatsAppUrl({ phone: '0599123456' })).toBe('https://wa.me/970599123456');
    expect(buildWhatsAppUrl()).toBe('https://wa.me/');
  });
});
