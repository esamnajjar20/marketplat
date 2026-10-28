/**
 * MY-STORE-HUB-01 — tab model for the merged "لوحة المتجر" page (/my-store).
 *
 * The hub replaces seven pages (/my-store/products, /collections, /promotions,
 * /inventory, /members, /analytics, /settings) with ONE route, so the service
 * worker only has to keep one document + one chunk set warm for the whole
 * store-management surface. Same pattern as lib/offlineHubTabs.ts.
 *
 * Deliberately NOT tabs (keep their own routes): /my-store/products/new,
 * /my-store/products/[id]/edit, /my-store/collections/[id] (deep create/edit
 * flows) and /my-store/followed (a buyer feature, not store management).
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const MY_STORE_TABS = [
  'overview',
  'products',
  'collections',
  'promotions',
  'inventory',
  'members',
  'analytics',
  'settings',
] as const;
export type MyStoreTab = (typeof MY_STORE_TABS)[number];

export const DEFAULT_MY_STORE_TAB: MyStoreTab = 'overview';

export const MY_STORE_HUB_PATH = '/my-store';

/** Old URLs → tab. Used by next.config redirects and by path-based resolution. */
export const LEGACY_MY_STORE_PATH_TO_TAB: Readonly<Record<string, MyStoreTab>> = {
  '/my-store/products': 'products',
  '/my-store/collections': 'collections',
  '/my-store/promotions': 'promotions',
  '/my-store/inventory': 'inventory',
  '/my-store/members': 'members',
  '/my-store/analytics': 'analytics',
  '/my-store/settings': 'settings',
};

const hub = createHubTabs<MyStoreTab>({
  tabs: MY_STORE_TABS,
  defaultTab: DEFAULT_MY_STORE_TAB,
  hubPath: MY_STORE_HUB_PATH,
  legacyPathToTab: LEGACY_MY_STORE_PATH_TO_TAB,
});

export function isMyStoreTab(value: unknown): value is MyStoreTab {
  return hub.isTab(value);
}

/** Tab requested by `?tab=…`, or by a Null when absent/unknown. */
export const resolveMyStoreTab = hub.resolveTab;

/** `/my-store?tab=products` (+ optional extra params, e.g. productId). The
 * overview tab is the bare `/my-store`. */
export function myStoreTabHref(tab: MyStoreTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

/**
 * Query string to use when SWITCHING to `tab` from the current one: only the
 * tab key survives. Per-tab list state (page, status, availability, q …) must
 * not leak from products into inventory, etc.
 */
export const searchForTabSwitch = hub.searchForTabSwitch;
