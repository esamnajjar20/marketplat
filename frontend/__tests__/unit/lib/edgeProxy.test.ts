/**
 * __tests__/unit/lib/edgeProxy.test.ts
 *
 * EDGE-AUTH-STRIP-01: the allowlist decides which requests lose their
 * Authorization/cookie and are served from the shared edge cache. A false
 * positive here leaks one user's data to another, so every viewer-specific
 * route is pinned as NOT eligible.
 */
import { describe, it, expect } from 'vitest';
import { isViewerIndependentPath, stripIdentityHeaders } from '@/lib/edgeProxy';

const yes = (p: string) => isViewerIndependentPath('GET', p.split('/').filter(Boolean));
const no = (p: string) => !yes(p);

describe('isViewerIndependentPath', () => {
  it('accepts public lists and details', () => {
    for (const p of [
      'home', 'categories', 'categories/5', 'categories/slug/cars',
      'ads', 'ads/search', 'ads/abc123', 'ads/abc123/related',
      'products', 'products/p1', 'stores', 'stores/s1', 'stores/s1/reviews',
      'service-listings', 'service-listings/l1', 'service-listings/l1/matches',
      'service-providers', 'service-providers/nearby', 'service-providers/sp1',
      'search', 'search/suggestions',
      'sellers/ranking', 'sellers/u1', 'sellers/u1/ratings',
      'store-types', 'service-types',
    ]) expect(yes(p), p).toBe(true);
  });

  it('rejects viewer-specific and owner-only routes', () => {
    for (const p of [
      'home/feed', 'recommendations', 'requests', 'requests/r1', 'requests/me',
      'requests/offers/me', 'ads/me', 'ads/me/stats', 'products/me',
      'products/stock/summary', 'products/stock/history', 'stores/me',
      'stores/me/followed', 'stores/me/analytics', 'stores/s1/members',
      'service-providers/me', 'service-providers/me/analytics',
      'service-listings/me', 'sellers/me/profile', 'sellers/me/attention',
      'categories/admin/all', 'favorites', 'conversations', 'notifications',
      'users/me', 'auth/refresh',
    ]) expect(no(p), p).toBe(true);
  });

  it('rejects non-GET methods and empty paths', () => {
    expect(isViewerIndependentPath('POST', ['ads'])).toBe(false);
    expect(isViewerIndependentPath('PATCH', ['ads', 'x'])).toBe(false);
    expect(isViewerIndependentPath('GET', [])).toBe(false);
    expect(isViewerIndependentPath('HEAD', ['ads'])).toBe(true);
  });
});

describe('stripIdentityHeaders', () => {
  it('removes identity headers and host, keeps the rest', () => {
    const out = stripIdentityHeaders(new Headers({
      Authorization: 'Bearer x', Cookie: 'a=1', 'X-CSRF-Token': 't',
      'X-Offline-Op-Id': 'op', Host: 'h', Accept: 'application/json',
      'Accept-Language': 'ar',
    }));
    expect(out.has('authorization')).toBe(false);
    expect(out.has('cookie')).toBe(false);
    expect(out.has('x-csrf-token')).toBe(false);
    expect(out.has('x-offline-op-id')).toBe(false);
    expect(out.has('host')).toBe(false);
    expect(out.get('accept')).toBe('application/json');
    expect(out.get('accept-language')).toBe('ar');
  });
});
