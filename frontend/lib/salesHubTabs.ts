/**
 * SALES-HUB-01 — tab model for the seller/provider sales workspace.
 *
 * One route owns the whole sales surface: overview, sales, customers, debts,
 * installments and analytics. Deep flows such as a sale receipt stay routes.
 */
import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const SALES_HUB_TABS = [
  'overview',
  'sales',
  'customers',
  'debts',
  'installments',
  'analytics',
  'costs',
] as const;

export type SalesHubTab = (typeof SALES_HUB_TABS)[number];
export const DEFAULT_SALES_HUB_TAB: SalesHubTab = 'overview';
export const SALES_HUB_PATH = '/account/sales';

export const LEGACY_SALES_PATH_TO_TAB: Readonly<Record<string, SalesHubTab>> = {
  '/account/sales': 'overview',
  '/account/customers': 'customers',
  '/account/sales/debts': 'debts',
  '/account/sales/installments': 'installments',
};

const hub = createHubTabs<SalesHubTab>({
  tabs: SALES_HUB_TABS,
  defaultTab: DEFAULT_SALES_HUB_TAB,
  hubPath: SALES_HUB_PATH,
  legacyPathToTab: LEGACY_SALES_PATH_TO_TAB,
});

export const isSalesHubTab = (value: unknown): value is SalesHubTab => hub.isTab(value);
export const resolveSalesHubTab = hub.resolveTab;

export function salesHubTabHref(tab: SalesHubTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

export const searchForSalesHubTabSwitch = hub.searchForTabSwitch;
