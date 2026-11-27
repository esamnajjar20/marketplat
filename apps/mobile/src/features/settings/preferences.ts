/** Native settings use the same preference schema/defaults/groups as the API and web. */
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_GROUPS,
} from '@marketplat/contracts';
import type { NotificationPreferences } from '@marketplat/contracts';

export type Preferences = NotificationPreferences;
export const DEFAULT_PREFS: Preferences = { ...NOTIFICATION_PREFERENCE_DEFAULTS };
export const DEFAULT_QUIET_TIME_ZONE = 'Asia/Gaza';
export type PreferenceGroup = (typeof NOTIFICATION_PREFERENCE_GROUPS)[number];
export const PREFERENCE_GROUPS: readonly PreferenceGroup[] = NOTIFICATION_PREFERENCE_GROUPS;

export function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** صيغة 24 ساعة `HH:mm` (00:00–23:59). */
export function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}
