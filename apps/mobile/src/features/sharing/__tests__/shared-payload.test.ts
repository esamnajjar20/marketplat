import { describe, expect, it } from 'vitest';
import { decodeSharedPayload, encodeSharedPayload, sharedPayloadFromUrl } from '../shared-payload';

const sample = {
  kind: 'product' as const,
  title: 'هاتف مستعمل',
  price: '250',
  city: 'غزة',
  extra: 'حالة ممتازة',
  desc: 'وصف عربي مع رموز: 📱',
};

describe('offline shared payload', () => {
  it('round-trips Arabic and Unicode text without data loss', () => {
    expect(decodeSharedPayload(encodeSharedPayload(sample))).toEqual(sample);
  });

  it('bounds each field before encoding and after decoding', () => {
    const decoded = decodeSharedPayload(encodeSharedPayload({
      kind: 'ad', title: 't'.repeat(100), price: 'p'.repeat(100), city: 'c'.repeat(100),
      extra: 'x'.repeat(100), desc: 'd'.repeat(500),
    }));
    expect(decoded).toEqual({ kind: 'ad', title: 't'.repeat(60), price: 'p'.repeat(40), city: 'c'.repeat(30), extra: 'x'.repeat(40), desc: 'd'.repeat(300) });
  });

  it.each(['', '!!!', 'a.b', 'a/b', 'a+b', 'a'.repeat(12001), 'eyJ2IjoyfQ'])('rejects malformed or unsupported payload %s', (value) => {
    expect(decodeSharedPayload(value)).toBeNull();
  });

  it('rejects valid base64url JSON with an unsupported version or kind', () => {
    const encodeRaw = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(decodeSharedPayload(encodeRaw({ v: 2, k: 'ad', t: 'x' }))).toBeNull();
    expect(decodeSharedPayload(encodeRaw({ v: 1, k: 'account', t: 'x' }))).toBeNull();
    expect(decodeSharedPayload(encodeRaw({ v: 1, k: 'ad', t: 42 }))).toBeNull();
  });

  it('extracts only the d parameter from the URL fragment', () => {
    expect(sharedPayloadFromUrl('https://example.test/shared#d=abc_123&other=x')).toBe('abc_123');
    expect(sharedPayloadFromUrl('https://example.test/shared?d=query#other=x')).toBeNull();
    expect(sharedPayloadFromUrl('https://example.test/shared#other=x')).toBeNull();
    expect(sharedPayloadFromUrl(null)).toBeNull();
    expect(sharedPayloadFromUrl('https://example.test/shared#d=')).toBeNull();
  });
});
