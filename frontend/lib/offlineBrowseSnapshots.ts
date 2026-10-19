/** Bounded exact-query snapshots for public filtered/search browse grids. */
import { localGet, localRemove, localSet } from '@/lib/localStore';
import { isOfflineHardExpired } from '@/lib/offlineFreshness';

interface Snapshot<T> { signature: string; items: T[]; savedAt: string; }
interface SnapshotStore<T> { entries: Snapshot<T>[]; }
const MAX_ENTRIES = 8;
const MAX_ITEMS = 16;
const PREFIX = 'offline-browse-snapshots:';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function signature(params: Record<string, unknown>): string { return stable(params); }

/** Store public results by their exact normalized filters; never cross-serve queries. */
export function saveOfflineBrowseSnapshot<T>(name: 'products' | 'ads', params: Record<string, unknown>, items: T[]): void {
  if (!Array.isArray(items) || items.length === 0) return;
  const storageKey = `${PREFIX}${name}`;
  const existing = localGet<SnapshotStore<T>>(storageKey, { entries: [] });
  const key = signature(params);
  const entry: Snapshot<T> = { signature: key, items: items.slice(0, MAX_ITEMS), savedAt: new Date().toISOString() };
  const entries = (Array.isArray(existing?.entries) ? existing.entries : []).filter((candidate) => candidate?.signature !== key && !isOfflineHardExpired(candidate?.savedAt));
  entries.unshift(entry);
  localSet(storageKey, { entries: entries.slice(0, MAX_ENTRIES) });
}

export function getOfflineBrowseSnapshot<T>(name: 'products' | 'ads', params: Record<string, unknown>): Snapshot<T> | null {
  const existing = localGet<SnapshotStore<T>>(`${PREFIX}${name}`, { entries: [] });
  if (!Array.isArray(existing?.entries)) return null;
  const key = signature(params);
  const entry = existing.entries.find((candidate) => candidate?.signature === key && Array.isArray(candidate.items) && candidate.items.length > 0 && !isOfflineHardExpired(candidate.savedAt));
  return entry ?? null;
}

export function clearOfflineBrowseSnapshots(name: 'products' | 'ads'): void {
  const storageKey = `${PREFIX}${name}`;
  localRemove(storageKey);
}
