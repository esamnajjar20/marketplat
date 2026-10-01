/**
 * SETTINGS-HUB-01 — tab model for the merged "الإعدادات" page (/settings).
 *
 * The hub replaces five account-settings pages (/settings/profile,
 * /security, /sessions, /notifications, /blocked-users) with ONE route, so
 * the service worker only has to keep one document + one chunk set warm for
 * the whole settings surface. Same pattern as lib/myStoreHubTabs.ts and
 * lib/myServicesHubTabs.ts.
 *
 * Seller + service-provider settings stay under the profile tab as internal
 * sections (UnifiedProfileSettings). Legacy paths /settings/seller and
 * /settings/service-provider redirect to /settings?tab=profile&section=….
 *
 * Deliberately NOT tabs (already moved to /offline hub): drafts, sync,
 * storage, offline.
 *
 * Pure module (no React, no browser globals) so it is unit-testable.
 */

import { createHubTabs, type HubExtraParams } from '@/lib/hubTabs';

export const SETTINGS_TABS = [
  'profile',
  'security',
  'sessions',
  'notifications',
  'blocked-users',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'profile';

export const SETTINGS_HUB_PATH = '/settings';

/** Old URLs → tab. Used by next.config redirects and by path-based resolution. */
export const LEGACY_SETTINGS_PATH_TO_TAB: Readonly<Record<string, SettingsTab>> = {
  '/settings/profile': 'profile',
  '/settings/security': 'security',
  '/settings/sessions': 'sessions',
  '/settings/notifications': 'notifications',
  '/settings/blocked-users': 'blocked-users',
  '/settings/seller': 'profile',
  '/settings/service-provider': 'profile',
};

/** Profile internal section (personal / seller / service). */
export const PROFILE_SECTIONS = ['personal', 'seller', 'service'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const DEFAULT_PROFILE_SECTION: ProfileSection = 'personal';

const hub = createHubTabs<SettingsTab>({
  tabs: SETTINGS_TABS,
  defaultTab: DEFAULT_SETTINGS_TAB,
  hubPath: SETTINGS_HUB_PATH,
  legacyPathToTab: LEGACY_SETTINGS_PATH_TO_TAB,
  // The default section is the bare profile tab.
  normalizeParams: (params) => {
    if (params.get('section') === DEFAULT_PROFILE_SECTION) params.delete('section');
  },
});

export function isSettingsTab(value: unknown): value is SettingsTab {
  return hub.isTab(value);
}

export function isProfileSection(value: unknown): value is ProfileSection {
  return typeof value === 'string' && (PROFILE_SECTIONS as readonly string[]).includes(value);
}

/** Tab requested by `?tab=…`, or by a legacy pathname. Null when absent/unknown. */
export const resolveSettingsTab = hub.resolveTab;

/** Profile section from `?section=…` or legacy path. */
export function resolveProfileSection(
  search: string,
  pathname = SETTINGS_HUB_PATH,
): ProfileSection {
  try {
    const fromQuery = new URLSearchParams(search).get('section');
    if (isProfileSection(fromQuery)) return fromQuery;
  } catch {
    /* ignore */
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/settings/seller') return 'seller';
  if (path === '/settings/service-provider') return 'service';
  return DEFAULT_PROFILE_SECTION;
}

/**
 * `/settings?tab=security` (+ optional section for profile).
 * The profile tab (default) is the bare `/settings` when no section is set.
 */
export function settingsTabHref(tab: SettingsTab, extra?: HubExtraParams): string {
  return hub.tabHref(tab, extra);
}

/**
 * Query string to use when SWITCHING to `tab` from the current one: only the
 * tab key survives (and section is dropped when leaving profile).
 */
export const searchForTabSwitch = hub.searchForTabSwitch;

/** Href for a profile internal section while staying on the profile tab. */
export function settingsProfileSectionHref(section: ProfileSection): string {
  return settingsTabHref('profile', {
    section: section === DEFAULT_PROFILE_SECTION ? undefined : section,
  });
}
