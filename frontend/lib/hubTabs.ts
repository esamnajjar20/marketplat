/**
 * hubTabs.ts — shared tab-model factory for the "merged page" hubs
 * (/my-store, /my-services, /activity, /settings).
 *
 * Before this file each of lib/{myStore,myServices,activity,settings}HubTabs.ts
 * carried its own byte-for-byte copy of isTab / resolveTab / tabHref /
 * searchForTabSwitch. Those modules now only declare their data (tab list,
 * default tab, legacy path map) and re-export the functions built here under
 * their historical names, so no caller or test had to change.
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

export interface HubTabsConfig<T extends string> {
  tabs: readonly T[];
  defaultTab: T;
  /** The single route that hosts every tab, e.g. '/my-store'. */
  hubPath: string;
  /** Old page URLs → tab (next.config redirects + path-based resolution). */
  legacyPathToTab: Readonly<Record<string, T>>;
  /** Optional last-step cleanup of the query (e.g. drop a default `section`). */
  normalizeParams?: (params: URLSearchParams) => void;
}

export type HubExtraParams = Record<string, string | number | undefined>;

export function createHubTabs<T extends string>(config: HubTabsConfig<T>) {
  const { tabs, defaultTab, hubPath, legacyPathToTab, normalizeParams } = config;

  function isTab(value: unknown): value is T {
    return typeof value === 'string' && (tabs as readonly string[]).includes(value);
  }

  /** Tab requested by `?tab=…`, or by a legacy pathname. Null when absent/unknown. */
  function resolveTab(search: string, pathname: string = hubPath): T | null {
    try {
      const fromQuery = new URLSearchParams(search).get('tab');
      if (isTab(fromQuery)) return fromQuery;
    } catch {
      /* malformed query — ignore */
    }
    return legacyPathToTab[pathname.replace(/\/+$/, '') || '/'] ?? null;
  }

  /** `<hubPath>?tab=…` (+ optional extra params). The default tab is the bare hub path. */
  function tabHref(tab: T, extra?: HubExtraParams): string {
    const params = new URLSearchParams();
    if (tab !== defaultTab) params.set('tab', tab);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== '' && k !== 'tab') params.set(k, String(v));
      }
    }
    normalizeParams?.(params);
    const qs = params.toString();
    return qs ? `${hubPath}?${qs}` : hubPath;
  }

  /**
   * Query string to use when SWITCHING to `tab` from the current one: only the
   * tab key survives. Per-tab list state (page, status, q …) must not leak
   * from one tab into another.
   */
  function searchForTabSwitch(tab: T): string {
    const href = tabHref(tab);
    const i = href.indexOf('?');
    return i === -1 ? '' : href.slice(i);
  }

  return { isTab, resolveTab, tabHref, searchForTabSwitch };
}
