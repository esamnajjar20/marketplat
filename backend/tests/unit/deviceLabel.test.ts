import {
  deviceFingerprint,
  labelForNativePlatform,
  labelFromUserAgent,
} from '../../src/shared/utils/deviceLabel';

describe('labelFromUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Firefox · Linux',
    ],
  ])('%s → %s', (ua, expected) => {
    expect(labelFromUserAgent(ua)).toBe(expected);
  });

  it('returns null without a usable User-Agent', () => {
    expect(labelFromUserAgent(undefined)).toBeNull();
    expect(labelFromUserAgent('')).toBeNull();
  });

  it('never exceeds the 60-char column', () => {
    expect((labelFromUserAgent('x'.repeat(5000)) ?? '').length).toBeLessThanOrEqual(60);
  });
});

describe('labelForNativePlatform', () => {
  it('maps known platforms and falls back generically', () => {
    expect(labelForNativePlatform('ios')).toBe('تطبيق iOS');
    expect(labelForNativePlatform('android')).toBe('تطبيق Android');
    expect(labelForNativePlatform('other')).toBe('تطبيق الجوال');
  });
});

describe('deviceFingerprint', () => {
  it('is stable, 16 hex chars, and differs per secret', () => {
    expect(deviceFingerprint('a')).toBe(deviceFingerprint('a'));
    expect(deviceFingerprint('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(deviceFingerprint('a')).not.toBe(deviceFingerprint('b'));
  });
});
