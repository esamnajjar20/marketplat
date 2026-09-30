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

export function isMyServicesTab(value: unknown): value is MyServicesTab {
  return typeof value === 'string' && (MY_SERVICES_TABS as readonly string[]).includes(value);
}

/** Tab requested by `?tab=…`, or by a legacy pathname. Null when absent/unknown. */
export function resolveMyServicesTab(
  search: string,
  pathname = MY_SERVICES_HUB_PATH,
): MyServicesTab | null {
  try {
    const fromQuery = new URLSearchParams(search).get('tab');
    if (isMyServicesTab(fromQuery)) return fromQuery;
  } catch {
    /* malformed query — ignore */
  }
  return LEGACY_MY_SERVICES_PATH_TO_TAB[pathname.replace(/\/+$/, '') || '/'] ?? null;
}

/** `/my-services?tab=requests` (+ optional extra params, e.g. status). The
 * overview tab is the bare `/my-services`. */
export function myServicesTabHref(
  tab: MyServicesTab,
  extra?: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_MY_SERVICES_TAB) params.set('tab', tab);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '' && k !== 'tab') params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${MY_SERVICES_HUB_PATH}?${qs}` : MY_SERVICES_HUB_PATH;
}

/**
 * Query string to use when SWITCHING to `tab` from the current one: only the
 * tab key survives. Per-tab list state (page, status, q …) must not leak
 * from one tab into another.
 */
export function searchForTabSwitch(tab: MyServicesTab): string {
  const href = myServicesTabHref(tab);
  const i = href.indexOf('?');
  return i === -1 ? '' : href.slice(i);
}
