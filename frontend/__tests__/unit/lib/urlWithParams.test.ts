import { describe, it, expect, vi } from 'vitest';
import { buildUrlWithParams, writeClientUrl } from '@/lib/urlWithParams';

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


describe('writeClientUrl', () => {
  it('updates same-origin query state with native history without using router navigation', () => {
    window.history.replaceState({}, '', '/my-services?page=2');

    writeClientUrl('/my-services?tab=requests&status=PENDING', 'push');

    expect(window.location.pathname).toBe('/my-services');
    expect(window.location.search).toBe('?tab=requests&status=PENDING');
  });

  it('uses replaceState for corrective URL changes', () => {
    window.history.replaceState({}, '', '/my-services?page=9');

    writeClientUrl('/my-services?tab=appointments&page=1', 'replace');

    expect(window.location.search).toBe('?tab=appointments&page=1');
  });

  it('passes null state so Next.js can preserve its router marker and sync useSearchParams', () => {
    // Next.js 15 marks App Router history entries with __NA and an internal
    // router tree. Passing that object back to pushState triggers Next's
    // internal-write guard and skips ACTION_RESTORE / useSearchParams updates.
    window.history.replaceState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 'current' } },
      '',
      '/my-services?page=1',
    );
    const pushSpy = vi.spyOn(window.history, 'pushState');

    writeClientUrl('/my-services?page=2', 'push');

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/my-services?page=2');
    expect(window.location.search).toBe('?page=2');
    pushSpy.mockRestore();
  });

  it('ignores external origins and unchanged URLs', () => {
    window.history.replaceState({}, '', '/my-services');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    writeClientUrl('https://example.com/steal', 'push');
    writeClientUrl('/my-services', 'push');

    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });
});
