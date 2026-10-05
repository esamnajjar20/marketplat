/**
 * OFFLINE-HUB-01 — tab model for the merged "مركز الأوفلاين" page (/offline).
 *
 * The hub replaces the separate offline management pages with one route so
 * the service worker only has to keep ONE document + one chunk set warm for
 * the whole offline surface.
 *
 * Pure module (no React, no browser globals) so it is unit-testable and safe
 * to import from anywhere.
 */

export const OFFLINE_TABS = ['storage', 'saved', 'payments', 'warming', 'sync', 'drafts'] as const;
export type OfflineTab = (typeof OFFLINE_TABS)[number];

/** Tabs a signed-out visitor may see. 'warming' only touches localStorage /
 * IndexedDB warming state (no auth), so it is safe for guests. The rest read
 * per-user drafts / queue / storage stats and need a signed-in user. */
export const GUEST_OFFLINE_TABS: readonly OfflineTab[] = ['saved', 'warming'];

// Authenticated users start with storage; guests fall back to their first visible tab.
export const DEFAULT_OFFLINE_TAB: OfflineTab = 'storage';

/** Old URLs → tab. Used when the service worker serves the /offline fallback
 * for a request whose address bar still shows the legacy path. */
const LEGACY_PATH_TO_TAB: Record<string, OfflineTab> = {
  '/saved-ads': 'saved',
  '/downloads': 'saved',
  '/settings/drafts': 'drafts',
  '/settings/sync': 'sync',
  '/settings/storage': 'storage',
  '/settings/offline': 'warming',
  '/saved-payments': 'payments',
};

export function isOfflineTab(value: unknown): value is OfflineTab {
  return typeof value === 'string' && (OFFLINE_TABS as readonly string[]).includes(value);
}

/** Tab explicitly requested by the URL (?tab=… or a legacy pathname), or null
 * when the page was reached as a plain fallback / bare /offline. */
export function resolveOfflineTab(search: string, pathname: string): OfflineTab | null {
  try {
    const fromQuery = new URLSearchParams(search).get('tab');
    if (isOfflineTab(fromQuery)) return fromQuery;
  } catch {
    /* malformed query — ignore */
  }
  const fromPath = LEGACY_PATH_TO_TAB[pathname.replace(/\/+$/, '') || '/'];
  return fromPath ?? null;
}

export function visibleOfflineTabs(isSignedIn: boolean): readonly OfflineTab[] {
  return isSignedIn ? OFFLINE_TABS : GUEST_OFFLINE_TABS;
}

/** `/offline?tab=sync` — the canonical link to a tab. */
export function offlineTabHref(tab: OfflineTab): string {
  return `/offline?tab=${tab}`;
}
