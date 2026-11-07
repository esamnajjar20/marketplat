import { describe, it, expect } from 'vitest';
import { buildUrlWithParams } from '@/lib/urlWithParams';

describe('buildUrlWithParams', () => {
  it('does not add a second "?" when the base already has a query (ROUTES.myAds)', () => {
    const url = buildUrlWithParams('/activity?tab=ads', new URLSearchParams('tab=ads&status=SOLD'));
    expect(url).toBe('/activity?tab=ads&status=SOLD');
    expect(url.split('?')).toHaveLength(2);
  });

  it('is stable across repeated navigations (the URL must not grow)', () => {
    let url = '/activity?tab=ads';
    for (let i = 0; i < 5; i++) {
      const sp = new URLSearchParams(url.split('?')[1] ?? '');
      sp.set('status', i % 2 ? 'SOLD' : 'ACTIVE');
      sp.delete('page');
      url = buildUrlWithParams('/activity?tab=ads', sp);
    }
    expect(url).toBe('/activity?tab=ads&status=ACTIVE');
  });

  it('keeps the base query when params omit that key', () => {
    expect(buildUrlWithParams('/activity?tab=requests', 'page=2')).toBe('/activity?tab=requests&page=2');
  });

  it('lets params override a base key', () => {
    expect(buildUrlWithParams('/activity?tab=ads', 'tab=reports')).toBe('/activity?tab=reports');
  });

  it('behaves like plain concatenation for a query-less base', () => {
    expect(buildUrlWithParams('/ads', 'page=3&q=laptop')).toBe('/ads?page=3&q=laptop');
  });

  it('returns the bare path (no trailing "?") when the final query is empty', () => {
    expect(buildUrlWithParams('/my-store', new URLSearchParams())).toBe('/my-store');
    expect(buildUrlWithParams('/activity?tab=ads', new URLSearchParams())).toBe('/activity?tab=ads');
  });

  it('preserves repeated keys from params', () => {
    expect(buildUrlWithParams('/x?a=1', 'a=2&a=3')).toBe('/x?a=2&a=3');
  });
});
