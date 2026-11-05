import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOfflineDocumentUrl, isNextFlightRequest, isNextPrefetchRequest, installOfflineNavigationFallback } from '@/lib/offlineNavigationFallback';

describe('offline App Router navigation fallback', () => {
  it('converts an internal Flight URL to its document URL without losing page filters', () => {
    const target = getOfflineDocumentUrl(
      new URL('https://marketplat.test/ads?city=nablus&category=vehicles&_rsc=token'),
      'https://marketplat.test/products',
    );
    expect(target?.href).toBe('https://marketplat.test/ads?city=nablus&category=vehicles');
  });

  it('rejects external, API, and Next asset destinations', () => {
    expect(getOfflineDocumentUrl(new URL('https://other.test/products'), 'https://marketplat.test/')).toBeNull();
    expect(getOfflineDocumentUrl(new URL('https://marketplat.test/api/v1/ads'), 'https://marketplat.test/')).toBeNull();
    expect(getOfflineDocumentUrl(new URL('https://marketplat.test/api'), 'https://marketplat.test/')).toBeNull();
    expect(getOfflineDocumentUrl(new URL('https://marketplat.test/_next/static/app.js'), 'https://marketplat.test/')).toBeNull();
    expect(getOfflineDocumentUrl(new URL('https://marketplat.test/_next'), 'https://marketplat.test/')).toBeNull();
    expect(getOfflineDocumentUrl(new URL('https://marketplat.test/login'), 'https://marketplat.test/')).toBeNull();
  });

  it('recognizes all supported Next Flight request signatures', () => {
    const stateTree = isNextFlightRequest('/ads?_rsc=tree', {
      headers: { 'Next-Router-State-Tree': 'tree' },
    });
    const accept = isNextFlightRequest('/products', {
      headers: { Accept: 'text/x-component' },
    });
    const prefetch = isNextFlightRequest('/services', {
      headers: { 'Next-Router-Prefetch': '1' },
    });
    expect(stateTree?.pathname).toBe('/ads');
    expect(accept?.pathname).toBe('/products');
    expect(prefetch?.pathname).toBe('/services');
  });

  it('does not treat ordinary API fetches or POST server actions as page navigations', () => {
    expect(isNextFlightRequest('/api/v1/ads', { headers: { Accept: 'application/json' } })).toBeNull();
    expect(isNextFlightRequest('/ads?_rsc=token', { method: 'POST', headers: { RSC: '1' } })).toBeNull();
  });

  it('detects speculative prefetch requests (OFFLINE-PREFETCH-01)', () => {
    expect(isNextPrefetchRequest('/services?_rsc=a', { headers: { 'Next-Router-Prefetch': '1' } })).toBe(true);
    expect(isNextPrefetchRequest('/services?_rsc=a', { headers: { 'Next-Router-Segment-Prefetch': '/_tree' } })).toBe(true);
    expect(isNextPrefetchRequest('/services?_rsc=a', { headers: { Purpose: 'prefetch' } })).toBe(true);
    expect(isNextPrefetchRequest('/services?_rsc=a', { headers: { RSC: '1' } })).toBe(false);
  });

  describe('failed Flight requests', () => {
    const originalFetch = window.fetch;
    afterEach(() => {
      window.fetch = originalFetch;
      vi.unstubAllGlobals();
    });

    function install(failWith: Error) {
      const failing = vi.fn().mockRejectedValue(failWith);
      window.fetch = failing as unknown as typeof window.fetch;
      Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
      const assign = vi.fn();
      vi.stubGlobal('location', {
        href: 'https://marketplat.test/',
        origin: 'https://marketplat.test',
        pathname: '/',
        search: '',
        hash: '',
        assign,
      });
      const cleanup = installOfflineNavigationFallback();
      return { assign, cleanup };
    }

    it('does not navigate away when a prefetch fails offline', async () => {
      const { assign, cleanup } = install(new TypeError('Failed to fetch'));
      await expect(window.fetch('/ads?_rsc=x', { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } })).rejects.toThrow();
      expect(assign).not.toHaveBeenCalled();
      cleanup();
    });

    it('still falls back to a document navigation when a real navigation fetch fails', async () => {
      const { assign, cleanup } = install(new TypeError('Failed to fetch'));
      await expect(window.fetch('/ads?_rsc=x', { headers: { RSC: '1' } })).rejects.toThrow();
      expect(assign).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });
});
