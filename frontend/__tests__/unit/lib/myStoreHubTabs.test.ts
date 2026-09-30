import { describe, it, expect } from 'vitest';
import {
  MY_STORE_TABS,
  DEFAULT_MY_STORE_TAB,
  LEGACY_MY_STORE_PATH_TO_TAB,
  isMyStoreTab,
  resolveMyStoreTab,
  myStoreTabHref,
  searchForTabSwitch,
} from '@/lib/myStoreHubTabs';

describe('myStoreHubTabs', () => {
  it('isMyStoreTab accepts only known tabs', () => {
    for (const t of MY_STORE_TABS) expect(isMyStoreTab(t)).toBe(true);
    expect(isMyStoreTab('nope')).toBe(false);
    expect(isMyStoreTab(null)).toBe(false);
    expect(isMyStoreTab(undefined)).toBe(false);
  });

  it('resolves tab from ?tab=', () => {
    expect(resolveMyStoreTab('?tab=members')).toBe('members');
    expect(resolveMyStoreTab('?tab=members&page=2')).toBe('members');
  });

  it('returns null for missing or unknown tab', () => {
    expect(resolveMyStoreTab('')).toBeNull();
    expect(resolveMyStoreTab('?tab=bogus')).toBeNull();
  });

  it('resolves legacy pathnames, tolerating a trailing slash', () => {
    expect(resolveMyStoreTab('', '/my-store/analytics')).toBe('analytics');
    expect(resolveMyStoreTab('', '/my-store/analytics/')).toBe('analytics');
  });

  it('every legacy path maps to a real tab', () => {
    for (const tab of Object.values(LEGACY_MY_STORE_PATH_TO_TAB)) {
      expect(isMyStoreTab(tab)).toBe(true);
    }
  });

  it('builds hrefs; overview is the bare hub path', () => {
    expect(myStoreTabHref(DEFAULT_MY_STORE_TAB)).toBe('/my-store');
    expect(myStoreTabHref('products')).toBe('/my-store?tab=products');
    expect(myStoreTabHref('promotions', { productId: 'p1' })).toBe(
      '/my-store?tab=promotions&productId=p1',
    );
    expect(myStoreTabHref('products', { availability: undefined, tab: 'x' })).toBe(
      '/my-store?tab=products',
    );
  });

  it('tab switch drops per-tab params', () => {
    expect(searchForTabSwitch('inventory')).toBe('?tab=inventory');
    expect(searchForTabSwitch('overview')).toBe('');
  });
});
