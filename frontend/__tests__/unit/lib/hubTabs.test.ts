/**
 * __tests__/unit/lib/hubTabs.test.ts
 *
 * Direct coverage for the shared tab-model factory behind /my-store,
 * /my-services, /activity and /settings. The per-hub wrappers keep their own
 * tests (myStoreHubTabs / myServicesHubTabs / …); this pins the generic rules.
 */
import { describe, it, expect } from 'vitest';
import { createHubTabs } from '@/lib/hubTabs';

const TABS = ['home', 'one', 'two'] as const;
type Tab = (typeof TABS)[number];

function make(normalizeParams?: (p: URLSearchParams) => void) {
  return createHubTabs<Tab>({
    tabs: TABS,
    defaultTab: 'home',
    hubPath: '/hub',
    legacyPathToTab: { '/hub/one': 'one', '/old-two': 'two' },
    normalizeParams,
  });
}

describe('createHubTabs', () => {
  it('isTab accepts only declared tabs', () => {
    const { isTab } = make();
    expect(isTab('one')).toBe(true);
    expect(isTab('nope')).toBe(false);
    expect(isTab(undefined)).toBe(false);
    expect(isTab(3)).toBe(false);
  });

  it('resolveTab prefers ?tab=, then the legacy pathname, else null', () => {
    const { resolveTab } = make();
    expect(resolveTab('?tab=two')).toBe('two');
    expect(resolveTab('?tab=bogus')).toBeNull();
    expect(resolveTab('', '/hub/one')).toBe('one');
    expect(resolveTab('', '/old-two/')).toBe('two');
    expect(resolveTab('?tab=two', '/hub/one')).toBe('two');
    expect(resolveTab('')).toBeNull();
  });

  it('tabHref leaves the default tab bare and appends extras (never overriding tab)', () => {
    const { tabHref } = make();
    expect(tabHref('home')).toBe('/hub');
    expect(tabHref('one')).toBe('/hub?tab=one');
    expect(tabHref('one', { page: 2, q: '', skip: undefined, tab: 'two' })).toBe('/hub?tab=one&page=2');
    expect(tabHref('home', { page: 2 })).toBe('/hub?page=2');
  });

  it('searchForTabSwitch keeps only the tab key', () => {
    const { searchForTabSwitch } = make();
    expect(searchForTabSwitch('home')).toBe('');
    expect(searchForTabSwitch('two')).toBe('?tab=two');
  });

  it('normalizeParams runs last (e.g. dropping a default section)', () => {
    const { tabHref } = make((p) => {
      if (p.get('section') === 'personal') p.delete('section');
    });
    expect(tabHref('home', { section: 'personal' })).toBe('/hub');
    expect(tabHref('home', { section: 'seller' })).toBe('/hub?section=seller');
  });
});
