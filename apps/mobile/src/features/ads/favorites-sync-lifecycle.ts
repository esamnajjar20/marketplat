import {
  acknowledgeFavoriteState,
  findFavoriteState,
  listPendingFavoriteStates,
  writeFavoriteAdIds,
} from './favorites.store';
import { fetchFavoriteAdIds, setFavoriteAdState } from './favorites.api';

export type FavoritesSyncSnapshot = {
  isOnline: boolean;
  isActive: boolean;
  userId: string | null;
  token: string | null;
  csrfToken: string | null;
};

export type FavoritesSyncResult =
  | { status: 'skipped'; reason: 'offline' | 'inactive' | 'signed-out' }
  | { status: 'synced'; pendingAcknowledged: number; favoriteCount: number }
  | { status: 'deferred'; pendingAcknowledged: number; reason: string; retryAfterActiveSync?: boolean };

let activeSync: Promise<FavoritesSyncResult> | null = null;

/** Exposes the in-flight sync promise (if any) so callers can wait for completion. */
export function getActiveSyncPromise(): Promise<FavoritesSyncResult> | null {
  return activeSync;
}
let activeKey: string | null = null;
let sessionEpoch = 0;

/** Invalidates work captured with a previous auth session. In-flight HTTP cannot be aborted here,
 * but no subsequent queued request or cache reconciliation will run with the stale snapshot. */
export function invalidateFavoritesSyncSession(): void {
  sessionEpoch += 1;
}

/** Drains only the signed-in user's queue and then reconciles server state with newer pending intents. */
export async function syncFavoritesIfReady(snapshot: FavoritesSyncSnapshot): Promise<FavoritesSyncResult> {
  if (!snapshot.isOnline) return { status: 'skipped', reason: 'offline' };
  if (!snapshot.isActive) return { status: 'skipped', reason: 'inactive' };
  if (!snapshot.userId || !snapshot.token) return { status: 'skipped', reason: 'signed-out' };
  const key = snapshot.userId;
  if (activeSync) return activeKey === key
    ? activeSync
    : { status: 'deferred', pendingAcknowledged: 0, reason: 'مزامنة حساب آخر قيد التنفيذ؛ ستُعاد المحاولة بعد انتهائها.', retryAfterActiveSync: true };

  activeKey = key;
  const capturedEpoch = sessionEpoch;
  const sessionStillCurrent = () => capturedEpoch === sessionEpoch;
  activeSync = (async () => {
    let acknowledged = 0;
    const deferForSessionChange = () => ({ status: 'deferred', pendingAcknowledged: acknowledged, reason: 'تغيّرت جلسة تسجيل الدخول أثناء المزامنة؛ أُوقفت بقية الطلبات لحماية الحساب.' } as const);
    try {
      // Drain a bounded number of snapshots. A tap can replace a row while its request is in
      // flight; operation-id acknowledgement protects the newer row, and the next pass sends it.
      let remaining = await listPendingFavoriteStates(key);
      let passes = 0;
      while (remaining.length > 0 && passes < 10) {
        passes += 1;
        for (const operation of remaining) {
          if (!sessionStillCurrent()) return deferForSessionChange();
          // Never send a row belonging to another account, even if the storage layer changes later.
          if (operation.userId !== key) continue;
          // Avoid sending stale intent if a newer tap replaced this row before we began the request.
          // O(1) lookup replaces the O(N) full-list scan, eliminating O(N^2) SQLite reads.
          const latest = await findFavoriteState(key, operation.adId);
          if (!latest || latest.operationId !== operation.operationId) continue;
          await setFavoriteAdState(latest.adId, latest.favorited, snapshot.token!, latest.operationId, snapshot.csrfToken);
          // If auth changed while HTTP was in flight, leave the row queued. The endpoint is
          // replay-safe, so the same operation id can be confirmed by the correct session later.
          if (!sessionStillCurrent()) return deferForSessionChange();
          if (await acknowledgeFavoriteState(key, latest.adId, latest.operationId)) acknowledged += 1;
        }
        remaining = await listPendingFavoriteStates(key);
      }
      if (remaining.length > 0) {
        return { status: 'deferred', pendingAcknowledged: acknowledged, reason: 'تغيّرت المفضلة باستمرار أثناء المزامنة؛ احتُفظ بالعمليات الأحدث وستُعاد المحاولة.' } as const;
      }
      if (!sessionStillCurrent()) return deferForSessionChange();
      const serverIds = await fetchFavoriteAdIds(snapshot.token!);
      if (!sessionStillCurrent()) return deferForSessionChange();
      // Re-read after the network request: a tap made during fetch must win over the snapshot.
      const newerPending = await listPendingFavoriteStates(key);
      const merged = new Set(serverIds);
      for (const operation of newerPending) {
        if (operation.favorited) merged.add(operation.adId);
        else merged.delete(operation.adId);
      }
      if (!sessionStillCurrent()) return deferForSessionChange();
      await writeFavoriteAdIds([...merged], key);
      if (!sessionStillCurrent()) return deferForSessionChange();
      if (newerPending.length > 0) {
        return { status: 'deferred', pendingAcknowledged: acknowledged, reason: 'وصل تغيير جديد أثناء تحديث الكاش؛ حُفظ محليًا وسيُرسل في المزامنة التالية.' } as const;
      }
      return { status: 'synced', pendingAcknowledged: acknowledged, favoriteCount: merged.size } as const;
    } catch (error) {
      return { status: 'deferred', pendingAcknowledged: acknowledged, reason: error instanceof Error ? error.message : 'تعذرت مزامنة المفضلة.' } as const;
    }
  })();
  try { return await activeSync; }
  finally { activeSync = null; activeKey = null; }
}
