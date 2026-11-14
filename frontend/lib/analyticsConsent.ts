
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage';
const STORAGE_KEY = 'marketplat.analytics-consent';
export type AnalyticsConsent = 'granted' | 'denied';

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = safeStorageGet(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  try {
    safeStorageSet(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent('marketplat:analytics-consent', { detail: value }));
  } catch {
    // Privacy preference storage is best-effort; tracking remains disabled
    // when the preference cannot be persisted.
  }
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted';
}
