import { describe, expect, it } from 'vitest';
import {
  SALES_HUB_TABS,
  DEFAULT_SALES_HUB_TAB,
  LEGACY_SALES_PATH_TO_TAB,
  isSalesHubTab,
  resolveSalesHubTab,
  salesHubTabHref,
  searchForSalesHubTabSwitch,
} from '@/lib/salesHubTabs';

describe('salesHubTabs', () => {
  it('defines one tab for every sales workspace section', () => {
    expect(SALES_HUB_TABS).toEqual(['overview', 'sales', 'customers', 'debts', 'installments', 'analytics']);
    expect(new Set(SALES_HUB_TABS).size).toBe(SALES_HUB_TABS.length);
    for (const tab of SALES_HUB_TABS) expect(isSalesHubTab(tab)).toBe(true);
  });

  it('resolves query tabs and ignores unknown values', () => {
    expect(resolveSalesHubTab('?tab=debts&page=2')).toBe('debts');
    expect(resolveSalesHubTab('?tab=analytics')).toBe('analytics');
    expect(resolveSalesHubTab('?tab=nope')).toBeNull();
    expect(resolveSalesHubTab('')).toBeNull();
  });

  it('maps legacy pages to the corresponding hub tab', () => {
    expect(resolveSalesHubTab('', '/account/customers')).toBe('customers');
    expect(resolveSalesHubTab('', '/account/sales/debts/')).toBe('debts');
    expect(resolveSalesHubTab('', '/account/sales/installments')).toBe('installments');
    for (const tab of Object.values(LEGACY_SALES_PATH_TO_TAB)) expect(isSalesHubTab(tab)).toBe(true);
  });

  it('keeps overview as the bare route and isolates tab query state', () => {
    expect(salesHubTabHref(DEFAULT_SALES_HUB_TAB)).toBe('/account/sales');
    expect(salesHubTabHref('customers')).toBe('/account/sales?tab=customers');
    expect(salesHubTabHref('debts', { page: 2, status: 'OPEN' })).toBe('/account/sales?tab=debts&page=2&status=OPEN');
    expect(searchForSalesHubTabSwitch('overview')).toBe('');
    expect(searchForSalesHubTabSwitch('analytics')).toBe('?tab=analytics');
  });
});
