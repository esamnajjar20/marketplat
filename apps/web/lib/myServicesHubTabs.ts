/**
 * MY-SERVICES-HUB-01 — tab model for the merged "خدماتي" page (/my-services).
 *
 * The hub replaces three pages (/my-services/requests, /appointments,
 * /analytics) with ONE route, so the service worker only has to keep one
 * document + one chunk set warm for the whole provider workspace. Same
 * pattern as lib/myStoreHubTabs.ts and lib/offlineHubTabs.ts.
 *
 * Deliberately NOT tabs (keep their own routes): /my-services/new and
 * /my-services/[id]/edit (deep create/edit flows). /my-requests (requests the
 * user sent to providers) is a customer feature, not provider workspace.
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const MY_SERVICES_TABS = ['overview', 'requests', 'appointments', 'analytics'] as const;
export type MyServicesTab = (typeof MY_SERVICES_TABS)[number];

export const DEFAULT_MY_SERVICES_TAB: MyServicesTab = 'overview';

export const MY_SERVICES_HUB_PATH = '/my-services';

/** Old URLs → tab. Used by next.config redirects and by path-based resolution. */
export const LEGACY_MY_SERVICES_PATH_TO_TAB: Readonly<Record<string, MyServicesTab>> = {
  '/my-services/requests': 'requests',
  '/my-services/appointments': 'appointments',
  '/my-services/analytics': 'analytics',
};

const hub = createHubTabs<MyServicesTab>({
  tabs: MY_SERVICES_TABS,
  defaultTab: DEFAULT_MY_SERVICES_TAB,
  hubPath: MY_SERVICES_HUB_PATH,
  legacyPathToTab: LEGACY_MY_SERVICES_PATH_TO_TAB,
});

export function isMyServicesTab(value: unknown): value is MyServicesTab {
  return hub.isTab(value);
}

/** Tab requested by `?tab=…`, or by a Null when absent/unknown. */
export const resolveMyServicesTab = hub.resolveTab;

/** `/my-services?tab=requests` (+ optional extra params, e.g. status). The
 * overview tab is the bare `/my-services`. */
export function myServicesTabHref(tab: MyServicesTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

/**
 * Query string to use when SWITCHING to `tab` from the current one: only the
 * tab key survives. Per-tab list state (page, status, q …) must not leak
 * from one tab into another.
 */
export const searchForTabSwitch = hub.searchForTabSwitch;
