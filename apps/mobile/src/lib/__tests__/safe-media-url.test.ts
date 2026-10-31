import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedMediaUrl } from '../safe-media-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedMediaUrl', () => {
  it('accepts HTTPS media from the configured API and Cloudinary hosts', () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.marketplat.test');
    expect(isAllowedMediaUrl('https://api.marketplat.test/uploads/audio.m4a')).toBe(true);
    expect(isAllowedMediaUrl('https://res.cloudinary.com/demo/video/upload/audio.m4a')).toBe(true);
  });

  it('rejects non-HTTPS, credentials, ports, and lookalike hostnames', () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.marketplat.test');
    expect(isAllowedMediaUrl('http://api.marketplat.test/file')).toBe(false);
    expect(isAllowedMediaUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedMediaUrl('https://user:pass@api.marketplat.test/file')).toBe(false);
    expect(isAllowedMediaUrl('https://api.marketplat.test:8443/file')).toBe(false);
    expect(isAllowedMediaUrl('https://api.marketplat.test.evil.example/file')).toBe(false);
  });
});
