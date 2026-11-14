import { describe, it, expect } from 'vitest';
import { buildTelUrl, buildMailtoUrl } from '@/lib/contactLinks';

describe('buildTelUrl', () => {
  it('keeps plain local numbers unchanged', () => {
    expect(buildTelUrl('0599111222')).toBe('tel:0599111222');
  });
  it('strips spaces, dashes and parentheses', () => {
    expect(buildTelUrl('059-911 (1222)')).toBe('tel:0599111222');
  });
  it('preserves a single leading plus', () => {
    expect(buildTelUrl('+970 599 111 222')).toBe('tel:+970599111222');
  });
  it('returns an empty string for missing or non-numeric input', () => {
    expect(buildTelUrl(null)).toBe('');
    expect(buildTelUrl(undefined)).toBe('');
    expect(buildTelUrl('abc')).toBe('');
  });
});

describe('buildMailtoUrl', () => {
  it('builds a plain mailto link', () => {
    expect(buildMailtoUrl('help@example.com')).toBe('mailto:help@example.com');
  });
  it('appends an encoded subject and body', () => {
    expect(buildMailtoUrl('help@example.com', { subject: 'مرحبا بك', body: 'a b' })).toBe(
      `mailto:help@example.com?subject=${encodeURIComponent('مرحبا بك')}&body=a%20b`,
    );
  });
  it('returns an empty string for missing input', () => {
    expect(buildMailtoUrl('')).toBe('');
    expect(buildMailtoUrl(null)).toBe('');
  });
});
