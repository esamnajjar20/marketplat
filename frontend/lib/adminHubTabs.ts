/**
 * ADMIN-HUB-01 — one route (/admin) for the whole admin panel.
 *
 * Tabs live in `?tab=…` (same scheme as lib/myStoreHubTabs.ts & co). The 18
 * old pages (/admin/ads, /admin/users, …) redirect here via next.config.ts.
 *
 * What is deliberately NOT a tab:
 *  - /admin/debug/warming — a developer tool (not in the sidebar, ADMIN only).
 *
 * Role tiers live HERE, in one place. They used to be duplicated in
 * AdminSidebar (tierRequired) and app/(admin)/layout.tsx
 * (MODERATOR_ALLOWED_PREFIXES) and had drifted: the sidebar showed
 * "الطلبات المفتوحة" to a MODERATOR while the layout bounced them off it, even
 * though the backend gates GET /admin/open-requests at MODERATOR. This list
 * mirrors the backend's requireMinRole(MODERATOR) routes. It is routing
 * convenience only — the security boundary is the backend.
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const ADMIN_TABS = [
  'dashboard',
  'ads',
  'users',
  'sellers',
  'stores',
  'store-types',
  'reports',
  'fraud',
  'products',
  'service-listings',
  'open-requests',
  'categories',
  'service-categories',
  'product-categories',
  'notifications',
  'audit-logs',
  'analytics',
  'system',
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const DEFAULT_ADMIN_TAB: AdminTab = 'dashboard';

export const ADMIN_HUB_PATH = '/admin';

/** Old URLs → tab (next.config redirects + path-based resolution). */
export const LEGACY_ADMIN_PATH_TO_TAB: Readonly<Record<string, AdminTab>> = Object.fromEntries(
  ADMIN_TABS.map((tab) => [`/admin/${tab}`, tab]),
) as Record<string, AdminTab>;

/** Tabs a MODERATOR may open (backend: requireMinRole(MODERATOR)). */
export const MODERATOR_ADMIN_TABS: readonly AdminTab[] = [
  'ads',
  'reports',
  'fraud',
  'products',
  'service-listings',
  'open-requests',
];

/** Where a MODERATOR lands when no (allowed) tab is requested. */
export const MODERATOR_DEFAULT_ADMIN_TAB: AdminTab = 'ads';

export type AdminRoleLike = string | null | undefined;

export function isAdminTierRole(role: AdminRoleLike): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MODERATOR';
}

/** Fails closed: an unknown / missing role can open nothing. */
export function canOpenAdminTab(tab: AdminTab, role: AdminRoleLike): boolean {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  if (role === 'MODERATOR') return MODERATOR_ADMIN_TABS.includes(tab);
  return false;
}

export function adminTabsForRole(role: AdminRoleLike): AdminTab[] {
  return ADMIN_TABS.filter((tab) => canOpenAdminTab(tab, role));
}

export function defaultAdminTabForRole(role: AdminRoleLike): AdminTab {
  return role === 'MODERATOR' ? MODERATOR_DEFAULT_ADMIN_TAB : DEFAULT_ADMIN_TAB;
}

const hub = createHubTabs<AdminTab>({
  tabs: ADMIN_TABS,
  defaultTab: DEFAULT_ADMIN_TAB,
  hubPath: ADMIN_HUB_PATH,
  legacyPathToTab: LEGACY_ADMIN_PATH_TO_TAB,
});

export function isAdminTab(value: unknown): value is AdminTab {
  return hub.isTab(value);
}

/** Tab requested by `?tab=…`, or by a legacy pathname. Null when absent/unknown. */
export const resolveAdminTab = hub.resolveTab;

/** `/admin?tab=ads` (+ optional extra params). The dashboard tab is the bare `/admin`. */
export function adminTabHref(tab: AdminTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

/** Query string when SWITCHING to `tab`: only the tab key survives. */
export const searchForTabSwitch = hub.searchForTabSwitch;

/**
 * Href for a list's own refinements (filter / search / page) while staying on
 * `tab`. Whatever the table copied from useSearchParams() — including a stale
 * `tab` — is overridden, so a filter change can never bounce the admin to
 * another tab. Repeated keys are preserved.
 */
export function adminListHref(tab: AdminTab, params: URLSearchParams | string): string {
  const incoming = new URLSearchParams(typeof params === 'string' ? params : params.toString());
  incoming.delete('tab');
  const out = new URLSearchParams();
  if (tab !== DEFAULT_ADMIN_TAB) out.set('tab', tab);
  incoming.forEach((value, key) => out.append(key, value));
  const qs = out.toString();
  return qs ? `${ADMIN_HUB_PATH}?${qs}` : ADMIN_HUB_PATH;
}

/**
 * Props for the shared <Pagination>: its links must target the hub with the
 * tab pinned (the old per-page baseUrls now only exist as redirects). `params`
 * is the table's useSearchParams() (or a plain object of its filters).
 */
export function adminPagination(
  tab: AdminTab,
  params: Pick<URLSearchParams, 'entries'> | Record<string, string | undefined>,
): { baseUrl: string; searchParams: Record<string, string> } {
  const searchParams: Record<string, string> = {};
  const entries: Array<[string, string | undefined]> =
    'entries' in params && typeof params.entries === 'function'
      ? Array.from((params as Pick<URLSearchParams, 'entries'>).entries())
      : Object.entries(params as Record<string, string | undefined>);
  for (const [key, value] of entries) {
    if (value !== undefined) searchParams[key] = value;
  }
  if (tab !== DEFAULT_ADMIN_TAB) searchParams.tab = tab;
  else delete searchParams.tab;
  return { baseUrl: ADMIN_HUB_PATH, searchParams };
}

/**
 * The tab actually shown for `search`: the requested one when this role may
 * open it, otherwise the role's default.
 */
export function effectiveAdminTab(search: string, role: AdminRoleLike): AdminTab {
  const requested = resolveAdminTab(search);
  return requested && canOpenAdminTab(requested, role) ? requested : defaultAdminTabForRole(role);
}

/** Sidebar / tab-strip active state. */
export function isAdminTabActive(
  pathname: string,
  search: string,
  tab: AdminTab,
  role: AdminRoleLike,
): boolean {
  if ((pathname.replace(/\/+$/, '') || '/') !== ADMIN_HUB_PATH) return false;
  return effectiveAdminTab(search, role) === tab;
}
