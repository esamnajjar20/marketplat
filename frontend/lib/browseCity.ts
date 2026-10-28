/**
 * Guest browse-city preference for the homepage (and any consumer that
 * should respect a city filter without requiring a profile).
 *
 * Priority at read time is handled by useBrowseCity:
 *   1. authenticated user.city from the profile
 *   2. this localStorage value
 *   3. undefined → general / unfiltered lists
 *
 * Same-tab updates use a tiny EventTarget bus (mirrors the GPS bus in
 * useLocationResolver) because the native `storage` event only fires
 * across tabs.
 */

export const BROWSE_CITY_STORAGE_KEY = 'home:browseCity';
export const BROWSE_ALL_CITIES = '__ALL__';

const bus =
  typeof window !== 'undefined' ? new EventTarget() : null;
const EVENT = 'browse-city:updated';

export function readBrowseCity(): string | typeof BROWSE_ALL_CITIES | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(BROWSE_CITY_STORAGE_KEY);
    const v = raw?.trim();
    if (v === BROWSE_ALL_CITIES) return BROWSE_ALL_CITIES;
    return v || undefined;
  } catch {
    return undefined;
  }
}

export function writeBrowseCity(city: string | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (!city?.trim()) {
      localStorage.setItem(BROWSE_CITY_STORAGE_KEY, BROWSE_ALL_CITIES);
    } else {
      localStorage.setItem(BROWSE_CITY_STORAGE_KEY, city.trim());
    }
  } catch {
    // quota / private mode — ignore
  }
  bus?.dispatchEvent(new Event(EVENT));
}

export function subscribeBrowseCity(listener: () => void): () => void {
  if (!bus) return () => undefined;
  bus.addEventListener(EVENT, listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === BROWSE_CITY_STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    bus.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
