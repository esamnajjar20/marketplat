/**
 * Safe browser-storage access shared by local persistence adapters.
 * Accessing window.localStorage itself can throw in restricted/private contexts,
 * so callers must not read the property before entering a guarded helper.
 */

export type BrowserStorageKind = 'local' | 'session';

export function getBrowserStorage(kind: BrowserStorageKind = 'local'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = kind === 'session' ? window.sessionStorage : window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function safeStorageGet(
  key: string,
  kind: BrowserStorageKind = 'local',
): string | null {
  try {
    return getBrowserStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(
  key: string,
  value: string,
  kind: BrowserStorageKind = 'local',
): boolean {
  try {
    const storage = getBrowserStorage(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(
  key: string,
  kind: BrowserStorageKind = 'local',
): boolean {
  try {
    const storage = getBrowserStorage(kind);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** JSON.stringify can return undefined or throw for cyclic/BigInt values. */
export function serializeStorageValue(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
}
