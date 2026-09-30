import { describe, it, expect } from 'vitest';
import {
  MY_SERVICES_TABS,
  DEFAULT_MY_SERVICES_TAB,
  LEGACY_MY_SERVICES_PATH_TO_TAB,
  isMyServicesTab,
  resolveMyServicesTab,
  myServicesTabHref,
  searchForTabSwitch,
} from '@/lib/myServicesHubTabs';

describe('myServicesHubTabs', () => {
  it('isMyServicesTab accepts only known tabs', () => {
    for (const t of MY_SERVICES_TABS) expect(isMyServicesTab(t)).toBe(true);
    expect(isMyServicesTab('nope')).toBe(false);
    expect(isMyServicesTab(null)).toBe(false);
  });

  it('resolves tab from ?tab= and ignores unknown/missing', () => {
    expect(resolveMyServicesTab('?tab=requests')).toBe('requests');
    expect(resolveMyServicesTab('?tab=appointments&page=2')).toBe('appointments');
    expect(resolveMyServicesTab('')).toBeNull();
    expect(resolveMyServicesTab('?tab=bogus')).toBeNull();
  });

  it('resolves legacy pathnames, tolerating a trailing slash', () => {
    expect(resolveMyServicesTab('', '/my-services/analytics')).toBe('analytics');
    expect(resolveMyServicesTab('', '/my-services/requests/')).toBe('requests');
    expect(resolveMyServicesTab('', '/my-services/new')).toBeNull();
  });

  it('every legacy path maps to a real tab', () => {
    for (const tab of Object.values(LEGACY_MY_SERVICES_PATH_TO_TAB)) {
      expect(isMyServicesTab(tab)).toBe(true);
    }
  });

  it('builds hrefs; overview is the bare hub path', () => {
    expect(myServicesTabHref(DEFAULT_MY_SERVICES_TAB)).toBe('/my-services');
    expect(myServicesTabHref('requests')).toBe('/my-services?tab=requests');
    expect(myServicesTabHref('requests', { status: 'PENDING', page: 2 })).toBe(
      '/my-services?tab=requests&status=PENDING&page=2',
    );
    expect(myServicesTabHref('analytics', { status: undefined, tab: 'x' })).toBe(
      '/my-services?tab=analytics',
    );
  });

  it('searchForTabSwitch keeps only the tab key', () => {
    expect(searchForTabSwitch('overview')).toBe('');
    expect(searchForTabSwitch('appointments')).toBe('?tab=appointments');
  });
});
