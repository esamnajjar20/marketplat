import * as SecureStore from 'expo-secure-store';

const FAVORITES_KEY_PREFIX = 'marketplat.mobile.favorite-ad-ids.v2';
const LEGACY_FAVORITES_KEY = 'marketplat.mobile.favorite-ad-ids.v1';
function favoritesKey(userId?: string | null): string {
  const scope = userId?.trim() ? `user:${userId.trim()}` : 'guest';
  return `${FAVORITES_KEY_PREFIX}:${scope}`;
}

/** Cache favorites separately for each signed-in account; guest data is never read as account data. */
export async function readFavoriteAdIds(userId?: string | null): Promise<string[]> {
  try {
    const key = favoritesKey(userId);
    let raw = await SecureStore.getItemAsync(key);
    // Migrate the old unscoped cache to guest-only storage; never expose it to an account.
    if (!raw && !userId) {
      const legacy = await SecureStore.getItemAsync(LEGACY_FAVORITES_KEY);
      if (legacy) { raw = legacy; await SecureStore.setItemAsync(key, legacy); await SecureStore.deleteItemAsync(LEGACY_FAVORITES_KEY).catch(() => undefined); }
    }
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

export async function writeFavoriteAdIds(ids: string[], userId?: string | null): Promise<void> {
  const normalized = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  await SecureStore.setItemAsync(favoritesKey(userId), JSON.stringify(normalized));
}

// Durable, account-scoped desired-state queue. A row represents the latest user intent
// for one ad; coalescing prevents repeated taps from filling the queue.
import * as SQLite from 'expo-sqlite';

const FAVORITES_QUEUE_DB = 'marketplat-public-cache.db';
let favoritesQueueDb: Promise<SQLite.SQLiteDatabase> | null = null;
async function queueDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!favoritesQueueDb) {
    favoritesQueueDb = (async () => {
      const db = await SQLite.openDatabaseAsync(FAVORITES_QUEUE_DB);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS favorite_state_outbox (
          user_id TEXT NOT NULL,
          ad_id TEXT NOT NULL,
          favorited INTEGER NOT NULL CHECK (favorited IN (0,1)),
          operation_id TEXT NOT NULL,
          previous_favorited INTEGER CHECK (previous_favorited IN (0,1)),
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, ad_id)
        );
        CREATE INDEX IF NOT EXISTS favorite_state_outbox_updated_idx
          ON favorite_state_outbox(updated_at, ad_id);
      `);
      // Upgrade databases created before cancellation could restore the pre-queue state.
      // Legacy rows remain NULL so cancellation fails closed rather than guessing.
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(favorite_state_outbox)');
      if (!columns.some((column) => column.name === 'previous_favorited')) {
        await db.execAsync('ALTER TABLE favorite_state_outbox ADD COLUMN previous_favorited INTEGER CHECK (previous_favorited IN (0,1))');
      }
      return db;
    })().catch((error) => { favoritesQueueDb = null; throw error; });
  }
  return favoritesQueueDb;
}

export type PendingFavoriteState = { userId: string; adId: string; favorited: boolean; operationId: string; previousFavorited: boolean | null };
export type EnqueueFavoriteStateInput = Omit<PendingFavoriteState, 'previousFavorited'> & { previousFavorited: boolean };

export async function enqueueFavoriteState(input: EnqueueFavoriteStateInput): Promise<void> {
  if (!input.userId.trim() || !input.adId.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operationId)) {
    throw new Error('بيانات المفضلة غير صالحة للحفظ دون اتصال.');
  }
  const db = await queueDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ present: number }>(
      'SELECT 1 AS present FROM favorite_state_outbox WHERE user_id = ? AND ad_id = ?', input.userId, input.adId,
    );
    const count = await txn.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM favorite_state_outbox WHERE user_id = ?', input.userId,
    );
    if (!existing && (count?.count ?? 0) >= 50) {
      throw new Error('قائمة مزامنة المفضلة ممتلئة (50 عملية). اتصل بالإنترنت لمزامنتها أولًا.');
    }
    await txn.runAsync(
      `INSERT INTO favorite_state_outbox (user_id, ad_id, favorited, operation_id, previous_favorited, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, ad_id) DO UPDATE SET favorited=excluded.favorited,
         operation_id=excluded.operation_id, updated_at=excluded.updated_at,
         previous_favorited=COALESCE(favorite_state_outbox.previous_favorited, excluded.previous_favorited)`,
      input.userId, input.adId, input.favorited ? 1 : 0, input.operationId, input.previousFavorited ? 1 : 0, Date.now(),
    );
  });
}

export async function listPendingFavoriteStates(userId: string): Promise<PendingFavoriteState[]> {
  const db = await queueDatabase();
  const rows = await db.getAllAsync<{ user_id: string; ad_id: string; favorited: number; operation_id: string; previous_favorited: number | null }>(
    'SELECT user_id, ad_id, favorited, operation_id, previous_favorited FROM favorite_state_outbox WHERE user_id = ? ORDER BY updated_at ASC, ad_id ASC', userId,
  );
  return rows.map((row) => ({ userId: row.user_id, adId: row.ad_id, favorited: row.favorited === 1, operationId: row.operation_id, previousFavorited: row.previous_favorited === null || row.previous_favorited === undefined ? null : row.previous_favorited === 1 }));
}

export async function findFavoriteState(userId: string, adId: string): Promise<PendingFavoriteState | null> {
  const db = await queueDatabase();
  const row = await db.getFirstAsync<{ user_id: string; ad_id: string; favorited: number; operation_id: string; previous_favorited: number | null }>(
    'SELECT user_id, ad_id, favorited, operation_id, previous_favorited FROM favorite_state_outbox WHERE user_id = ? AND ad_id = ?',
    userId, adId,
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    adId: row.ad_id,
    favorited: row.favorited === 1,
    operationId: row.operation_id,
    previousFavorited: row.previous_favorited === null || row.previous_favorited === undefined ? null : row.previous_favorited === 1,
  };
}

export async function acknowledgeFavoriteState(userId: string, adId: string, operationId: string): Promise<boolean> {
  const db = await queueDatabase();
  const result = await db.runAsync(
    'DELETE FROM favorite_state_outbox WHERE user_id = ? AND ad_id = ? AND operation_id = ?',
    userId, adId, operationId,
  );
  return result.changes === 1;
}

/** Remove a queued favorite only when the operation id still matches the item the user saw. */
export async function discardFavoriteState(userId: string, adId: string, operationId: string): Promise<boolean> {
  const db = await queueDatabase();
  const result = await db.runAsync(
    'DELETE FROM favorite_state_outbox WHERE user_id = ? AND ad_id = ? AND operation_id = ?',
    userId, adId, operationId,
  );
  return result.changes === 1;
}

/** Restore a removed row only if no newer intent exists; used when a session changes mid-cancellation. */
export async function restoreFavoriteStateIfAbsent(item: PendingFavoriteState): Promise<boolean> {
  if (!item.userId.trim() || !item.adId.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.operationId)) return false;
  const db = await queueDatabase();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO favorite_state_outbox
      (user_id, ad_id, favorited, operation_id, previous_favorited, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    item.userId, item.adId, item.favorited ? 1 : 0, item.operationId,
    item.previousFavorited === null ? null : item.previousFavorited ? 1 : 0, Date.now(),
  );
  return result.changes === 1;
}

/**
 * Merge guest favorites into a newly signed-in user's account.
 *
 * Runs ONCE after successful login/register. Guest favorites remain isolated
 * from account data while the user is anonymous (as before), but on first
 * sign-in they are reconciled so the user does not silently lose the items
 * they starred while browsing as a guest.
 *
 * Behavior:
 * - Reads guest favorites and account favorites
 * - Union (deduplicated) is written to the account
 * - Each NEW favorite is enqueued for backend sync
 * - Guest key is cleared afterwards so subsequent sign-ins do not re-merge
 *
 * Safe to call when there are no guest favorites (no-op).
 * Capped at 50 items to match enqueueFavoriteState's per-user outbox limit.
 */
export async function mergeGuestFavoritesIntoAccount(userId: string): Promise<void> {
  const trimmed = userId.trim();
  if (!trimmed) return;

  const guestFavs = await readFavoriteAdIds(undefined);
  if (guestFavs.length === 0) return;

  const userFavs = await readFavoriteAdIds(trimmed);
  const userSet = new Set(userFavs);
  const toAdd = guestFavs.filter((id) => !userSet.has(id));

  if (toAdd.length > 0) {
    await writeFavoriteAdIds([...userFavs, ...toAdd], trimmed);
    for (const adId of toAdd.slice(0, 50)) {
      try {
        const operationId = `fav-merge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await enqueueFavoriteState({
          userId: trimmed,
          adId,
          favorited: true,
          previousFavorited: false,
          operationId,
        });
      } catch {
        // Individual enqueue failures retry on next sync (favorites are
        // already saved locally so the user sees them immediately).
      }
    }
  }

  // Clear guest key either way — user's favorites have been reconciled.
  await writeFavoriteAdIds([], undefined);
}
