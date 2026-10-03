/**
 * __tests__/unit/lib/adminHubTabs.test.ts
 *
 * ADMIN-HUB-01: the admin panel is one route (/admin) with the section in
 * ?tab=…. Pins the tab model, the role tiers (single source of truth for the
 * sidebar, the hub and the layout) and the href builders the tables use.
 */
import { describe, it, expect } from 'vitest';
import {
  ADMIN_TABS,
  LEGACY_ADMIN_PATH_TO_TAB,
  MODERATOR_ADMIN_TABS,
  adminListHref,
  adminPagination,
  adminTabHref,
  adminTabsForRole,
  canOpenAdminTab,
  defaultAdminTabForRole,
  effectiveAdminTab,
  isAdminTab,
  isAdminTabActive,
  resolveAdminTab,
  searchForTabSwitch,
} from '@/lib/adminHubTabs';

describe('admin tab model', () => {
  it('has 18 unique tabs', () => {
    expect(ADMIN_TABS).toHaveLength(18);
    expect(new Set(ADMIN_TABS).size).toBe(18);
  });

  it('every old /admin/<section> page maps to its tab', () => {
    for (const tab of ADMIN_TABS) expect(LEGACY_ADMIN_PATH_TO_TAB[`/admin/${tab}`]).toBe(tab);
    expect(Object.keys(LEGACY_ADMIN_PATH_TO_TAB)).toHaveLength(18);
  });

  it('isAdminTab / resolveAdminTab', () => {
    expect(isAdminTab('ads')).toBe(true);
    expect(isAdminTab('debug')).toBe(false);
    expect(resolveAdminTab('?tab=users')).toBe('users');
    expect(resolveAdminTab('?tab=nope')).toBeNull();
    expect(resolveAdminTab('')).toBeNull();
    expect(resolveAdminTab('', '/admin/sellers')).toBe('sellers');
    expect(resolveAdminTab('?tab=ads&page=2&status=ACTIVE')).toBe('ads');
  });
});

describe('hrefs', () => {
  it('dashboard is the bare hub, everything else carries ?tab=', () => {
    expect(adminTabHref('dashboard')).toBe('/admin');
    expect(adminTabHref('ads')).toBe('/admin?tab=ads');
    expect(adminTabHref('service-listings')).toBe('/admin?tab=service-listings');
  });

  it('adminTabHref appends extras after the tab (ops-queue deep links)', () => {
    expect(adminTabHref('reports', { status: 'PENDING' })).toBe('/admin?tab=reports&status=PENDING');
    expect(adminTabHref('sellers', { verification: 'PENDING' })).toBe('/admin?tab=sellers&verification=PENDING');
    expect(adminTabHref('fraud', { reviewed: 'false' })).toBe('/admin?tab=fraud&reviewed=false');
  });

  it('searchForTabSwitch keeps only the tab key', () => {
    expect(searchForTabSwitch('dashboard')).toBe('');
    expect(searchForTabSwitch('users')).toBe('?tab=users');
  });

  it('adminListHref pins the tab and keeps the list state, overriding any stale tab', () => {
    expect(adminListHref('ads', new URLSearchParams('tab=ads&status=ACTIVE&page=2'))).toBe(
      '/admin?tab=ads&status=ACTIVE&page=2',
    );
    expect(adminListHref('users', 'tab=ads&q=sara')).toBe('/admin?tab=users&q=sara');
    expect(adminListHref('users', '')).toBe('/admin?tab=users');
    expect(adminListHref('dashboard', '')).toBe('/admin');
    expect(adminListHref('ads', 'a=1&a=2')).toBe('/admin?tab=ads&a=1&a=2');
  });

  it('adminPagination targets the hub with the tab pinned', () => {
    expect(adminPagination('sellers', new URLSearchParams('tab=sellers&verification=PENDING'))).toEqual({
      baseUrl: '/admin',
      searchParams: { tab: 'sellers', verification: 'PENDING' },
    });
    expect(adminPagination('open-requests', { q: undefined, status: 'CANCELLED', type: 'SERVICE' })).toEqual({
      baseUrl: '/admin',
      searchParams: { status: 'CANCELLED', type: 'SERVICE', tab: 'open-requests' },
    });
  });
});

describe('role tiers', () => {
  it('ADMIN and SUPER_ADMIN open everything', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      expect(adminTabsForRole(role)).toHaveLength(18);
      expect(defaultAdminTabForRole(role)).toBe('dashboard');
    }
  });

  it('MODERATOR opens exactly the backend MODERATOR sections, defaulting to ads', () => {
    expect(adminTabsForRole('MODERATOR')).toEqual([
      'ads',
      'reports',
      'fraud',
      'products',
      'service-listings',
      'open-requests',
    ]);
    expect([...MODERATOR_ADMIN_TABS].sort()).toEqual(
      ['ads', 'fraud', 'open-requests', 'products', 'reports', 'service-listings'],
    );
    expect(defaultAdminTabForRole('MODERATOR')).toBe('ads');
    expect(canOpenAdminTab('users', 'MODERATOR')).toBe(false);
    expect(canOpenAdminTab('open-requests', 'MODERATOR')).toBe(true);
    expect(canOpenAdminTab('dashboard', 'MODERATOR')).toBe(false);
  });

  it('fails closed for USER, undefined and null', () => {
    for (const role of ['USER', undefined, null, '']) {
      expect(adminTabsForRole(role)).toEqual([]);
      expect(canOpenAdminTab('ads', role)).toBe(false);
    }
  });
});

describe('effective tab & active state', () => {
  it('uses the requested tab when the role may open it', () => {
    expect(effectiveAdminTab('?tab=users', 'ADMIN')).toBe('users');
    expect(effectiveAdminTab('?tab=reports&status=PENDING', 'MODERATOR')).toBe('reports');
  });

  it('falls back to the role default for a missing / unknown / forbidden tab', () => {
    expect(effectiveAdminTab('', 'ADMIN')).toBe('dashboard');
    expect(effectiveAdminTab('?tab=nope', 'ADMIN')).toBe('dashboard');
    expect(effectiveAdminTab('', 'MODERATOR')).toBe('ads');
    expect(effectiveAdminTab('?tab=users', 'MODERATOR')).toBe('ads');
  });

  it('isAdminTabActive only counts on the hub path', () => {
    expect(isAdminTabActive('/admin', '?tab=ads', 'ads', 'ADMIN')).toBe(true);
    expect(isAdminTabActive('/admin/', '', 'dashboard', 'ADMIN')).toBe(true);
    expect(isAdminTabActive('/admin', '?tab=ads', 'users', 'ADMIN')).toBe(false);
    expect(isAdminTabActive('/admin/debug/warming', '', 'dashboard', 'ADMIN')).toBe(false);
    expect(isAdminTabActive('/admin', '', 'ads', 'MODERATOR')).toBe(true);
  });
});
