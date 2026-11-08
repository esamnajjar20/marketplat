import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfiguredHttpsUrl, getConfiguredWebUrl } from '../web-links';

const DEFAULT_ORIGIN = 'https://marketplat.esamnajjar6.workers.dev';

afterEach(() => vi.unstubAllEnvs());

describe('configured public web links', () => {
  it('uses the configured HTTPS origin and normalizes relative paths', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', 'https://preview.marketplat.example/');
    expect(getConfiguredHttpsUrl('/products/p-1')).toBe('https://preview.marketplat.example/products/p-1');
    expect(getConfiguredHttpsUrl('ads/a-1')).toBe('https://preview.marketplat.example/ads/a-1');
  });

  it.each([
    'http://insecure.example',
    'javascript:alert(1)',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test/?next=evil',
    'https://example.test/#fragment',
    'not a URL',
  ])('falls back to the known HTTPS origin for unsafe configuration %s', (configured) => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', configured);
    expect(getConfiguredHttpsUrl('/shared')).toBe(`${DEFAULT_ORIGIN}/shared`);
  });

  it('does not allow an empty configured value to produce a relative or insecure URL', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', '   ');
    expect(getConfiguredHttpsUrl('/profile/u-1')).toBe(`${DEFAULT_ORIGIN}/profile/u-1`);
  });

  it('keeps the web-only resolver compatible with explicitly configured local HTTP origins', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', 'http://localhost:3000');
    expect(getConfiguredWebUrl('/privacy')).toBe('http://localhost:3000/privacy');
    expect(getConfiguredHttpsUrl('/privacy')).toBe(`${DEFAULT_ORIGIN}/privacy`);
  });
});
