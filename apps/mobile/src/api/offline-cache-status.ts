export type OfflineCacheStatus = Readonly<{
  count: number;
  latestSavedAt: number | null;
}>;

type Listener = () => void;
const staleEntries = new Map<string, number>();
const listeners = new Set<Listener>();
let snapshot: OfflineCacheStatus = { count: 0, latestSavedAt: null };

function publish(): void {
  let latestSavedAt: number | null = null;
  for (const savedAt of staleEntries.values()) {
    if (latestSavedAt === null || savedAt > latestSavedAt) latestSavedAt = savedAt;
  }
  if (snapshot.count === staleEntries.size && snapshot.latestSavedAt === latestSavedAt) return;
  snapshot = { count: staleEntries.size, latestSavedAt };
  for (const listener of listeners) listener();
}

/** Track a response that is currently being rendered from its offline snapshot. */
export function markOfflineCacheResponse(key: string, savedAt: number): void {
  if (!key || !Number.isFinite(savedAt)) return;
  staleEntries.set(key, savedAt);
  publish();
}

/** Remove the stale marker after the same resource has been refreshed successfully. */
export function markFreshApiResponse(key: string): void {
  if (!key || !staleEntries.delete(key)) return;
  publish();
}

export function getOfflineCacheStatusSnapshot(): OfflineCacheStatus {
  return snapshot;
}

export function subscribeOfflineCacheStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
