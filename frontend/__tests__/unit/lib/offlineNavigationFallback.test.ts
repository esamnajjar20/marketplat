import { describe, expect, it } from 'vitest';
import { getOfflineDocumentUrl, isNextFlightRequest } from '@/lib/offlineNavigationFallback';

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
});
