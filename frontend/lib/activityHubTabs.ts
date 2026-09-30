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

export function isActivityTab(value: unknown): value is ActivityTab {
  return typeof value === 'string' && (ACTIVITY_TABS as readonly string[]).includes(value);
}

/** Tab requested by `?tab=…`, or by a legacy pathname. Null when absent/unknown. */
export function resolveActivityTab(
  search: string,
  pathname = ACTIVITY_HUB_PATH,
): ActivityTab | null {
  try {
    const fromQuery = new URLSearchParams(search).get('tab');
    if (isActivityTab(fromQuery)) return fromQuery;
  } catch {
    /* malformed query — ignore */
  }
  return LEGACY_ACTIVITY_PATH_TO_TAB[pathname.replace(/\/+$/, '') || '/'] ?? null;
}

/**
 * `/activity?tab=ads` (+ optional extra params). The timeline tab is the
 * bare `/activity`.
 */
export function activityTabHref(
  tab: ActivityTab,
  extra?: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_ACTIVITY_TAB) params.set('tab', tab);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '' && k !== 'tab') params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${ACTIVITY_HUB_PATH}?${qs}` : ACTIVITY_HUB_PATH;
}

/**
 * Query string when SWITCHING to `tab`: only the tab key survives.
 * Per-tab list state (page, status, q …) must not leak across tabs.
 */
export function searchForTabSwitch(tab: ActivityTab): string {
  const href = activityTabHref(tab);
  const i = href.indexOf('?');
  return i === -1 ? '' : href.slice(i);
}
