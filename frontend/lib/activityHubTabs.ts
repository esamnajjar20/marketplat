/**
 * ACTIVITY-HUB-01 — tab model for the merged "نشاطي" page (/activity).
 *
 * The hub replaces four personal-activity pages (/activity, /my-ads,
 * /my-requests, /my-reports) with ONE route so the service worker only has
 * to keep one document + one chunk set warm. Same pattern as
 * lib/myStoreHubTabs.ts / lib/settingsHubTabs.ts.
 *
 * Deliberately NOT tabs (keep their own routes):
 *  - /my-ads/[id]/edit (deep edit flow)
 *  - /requests/me, /requests/offers, /requests/new (open-market REQUESTS_GROUP)
 *  - /favorites, /saved-searches, offline surfaces (separate hubs)
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const ACTIVITY_TABS = ['timeline', 'ads', 'requests', 'reports'] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export const DEFAULT_ACTIVITY_TAB: ActivityTab = 'timeline';

export const ACTIVITY_HUB_PATH = '/activity';

/** Old URLs → tab. Used by next.config redirects and path-based resolution. */
export const LEGACY_ACTIVITY_PATH_TO_TAB: Readonly<Record<string, ActivityTab>> = {
  '/activity': 'timeline',
  '/my-ads': 'ads',
  '/my-requests': 'requests',
  '/my-reports': 'reports',
};

const hub = createHubTabs<ActivityTab>({
  tabs: ACTIVITY_TABS,
  defaultTab: DEFAULT_ACTIVITY_TAB,
  hubPath: ACTIVITY_HUB_PATH,
  legacyPathToTab: LEGACY_ACTIVITY_PATH_TO_TAB,
});

export function isActivityTab(value: unknown): value is ActivityTab {
  return hub.isTab(value);
}

/** Tab requested by `?tab=…`, or by a Null when absent/unknown. */
export const resolveActivityTab = hub.resolveTab;

/**
 * `/activity?tab=ads` (+ optional extra params). The timeline tab is the
 * bare `/activity`.
 */
export function activityTabHref(tab: ActivityTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

/**
 * Query string when SWITCHING to `tab`: only the tab key survives.
 * Per-tab list state (page, status, q …) must not leak across tabs.
 */
export const searchForTabSwitch = hub.searchForTabSwitch;
