/** Shared envelope contract for localStorage-backed offline JSON and list caches. */

import { localGet, localRemove, localSet } from '@/lib/localStore';
import { isOfflineHardExpired } from '@/lib/offlineFreshness';

export interface OfflineCacheEnvelopeBase {
  savedAt: string;
  userId?: string | null;
}

export type OfflineCacheValueField = 'data' | 'items';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function saveOfflineEnvelope<T>(
  storageKey: string,
  field: OfflineCacheValueField,
  value: T,
  userId?: string | null,
): boolean {
  return localSet(storageKey, {
    [field]: value,
    savedAt: new Date().toISOString(),
    userId: userId ?? null,
  });
}

export function getOfflineEnvelope<T>(
  storageKey: string,
  field: 'data',
  fallbackValue: T,
  userId?: string | null,
): (OfflineCacheEnvelopeBase & { data: T }) | null;
export function getOfflineEnvelope<T>(
  storageKey: string,
  field: 'items',
  fallbackValue: T[],
  userId?: string | null,
): (OfflineCacheEnvelopeBase & { items: T[] }) | null;
export function getOfflineEnvelope<T>(
  storageKey: string,
  field: OfflineCacheValueField,
  fallbackValue: T | T[],
  userId?: string | null,
): any { // Dynamic envelope field; public overloads retain the precise return shape.
  const fallback = { [field]: fallbackValue, savedAt: '' } as Record<string, unknown>;
  const raw: unknown = localGet<unknown>(storageKey, fallback);
  if (!isRecord(raw)) return null;

  const savedAt = raw.savedAt;
  if (typeof savedAt !== 'string' || !savedAt || isOfflineHardExpired(savedAt)) return null;
  if (!Object.prototype.hasOwnProperty.call(raw, field)) return null;
  if (field === 'items' && !Array.isArray(raw.items)) return null;

  // If the caller is identity-aware, fail closed for legacy/unscoped entries.
  if (userId !== undefined && (raw.userId ?? null) !== (userId ?? null)) return null;

  return raw as OfflineCacheEnvelopeBase & Record<string, unknown>;
}

export function clearOfflineEnvelope(storageKey: string): void {
  localRemove(storageKey);
}
