import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import {
  isPublicCacheEntryUsable,
  planPublicCacheEviction,
  MAX_PUBLIC_CACHE_ENTRIES,
  MAX_PUBLIC_CACHE_BYTES,
} from './public-cache-policy.mjs';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_ENTRY_CHARS = 500_000;
const MAX_ENTRY_BYTES = 1_500_000;
type CacheRow = { value_json: string; saved_at: number; size_bytes?: number };

export type PublicCacheEntry<T> = { value: T; savedAt: number };
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openEncryptedDatabaseAsync(DATABASE_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS public_cache (
          cache_key TEXT PRIMARY KEY NOT NULL,
          value_json TEXT NOT NULL,
          saved_at INTEGER NOT NULL,
          size_chars INTEGER NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS public_cache_saved_at_idx ON public_cache(saved_at);
      `);
      // Repair old or interrupted cache-schema upgrades transactionally. A previous
      // partial ALTER/backfill must not leave zero byte estimates that bypass eviction.
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(public_cache)');
      const hasSizeChars = columns.some((column) => column.name === 'size_chars');
      const hasSizeBytes = columns.some((column) => column.name === 'size_bytes');
      if (!hasSizeChars || !hasSizeBytes) {
        await db.withExclusiveTransactionAsync(async (txn) => {
          if (!hasSizeChars) {
            await txn.execAsync('ALTER TABLE public_cache ADD COLUMN size_chars INTEGER NOT NULL DEFAULT 0');
          }
          if (!hasSizeBytes) {
            await txn.execAsync('ALTER TABLE public_cache ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0');
          }
          const rows = await txn.getAllAsync<{ cache_key: string; value_json: string }>(
            'SELECT cache_key, value_json FROM public_cache',
          );
          for (const row of rows) {
            await txn.runAsync(
              'UPDATE public_cache SET size_chars = ?, size_bytes = ? WHERE cache_key = ?',
              row.value_json.length, utf8ByteLength(row.value_json), row.cache_key,
            );
          }
        });
      } else {
        // Recover rows left with default values by an older interrupted backfill.
        await db.withExclusiveTransactionAsync(async (txn) => {
          const rows = await txn.getAllAsync<{ cache_key: string; value_json: string }>(
            "SELECT cache_key, value_json FROM public_cache WHERE size_bytes <= 0 OR size_chars <= 0",
          );
          for (const row of rows) {
            await txn.runAsync(
              'UPDATE public_cache SET size_chars = ?, size_bytes = ? WHERE cache_key = ?',
              row.value_json.length, utf8ByteLength(row.value_json), row.cache_key,
            );
          }
        });
      }
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}


export type PublicCacheStats = { entries: number; sizeBytes: number; newestSavedAt: number | null };

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Strict aggregate read for the storage-management screen: DB errors must remain distinguishable from an empty cache. */
export async function getPublicCacheStats(): Promise<PublicCacheStats> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ value_json: string; saved_at: number }>(
    'SELECT value_json, saved_at FROM public_cache',
  );
  let sizeBytes = 0;
  let newestSavedAt: number | null = null;
  for (const row of rows) {
    sizeBytes += utf8ByteLength(row.value_json);
    if (newestSavedAt === null || row.saved_at > newestSavedAt) newestSavedAt = row.saved_at;
  }
  return { entries: rows.length, sizeBytes, newestSavedAt };
}

/** SQLite-backed cache for public read-only data; never store auth/session secrets here. */
export async function readPublicCacheEntry<T>(key: string): Promise<PublicCacheEntry<T> | null> {
  if (!key.trim() || key.length > 300) return null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CacheRow>(
      'SELECT value_json, saved_at, size_bytes FROM public_cache WHERE cache_key = ?', key,
    );
    if (!row) return null;
    if (row.value_json.length > MAX_ENTRY_CHARS || !Number.isFinite(row.saved_at)
      || !isPublicCacheEntryUsable(key, row.saved_at, Date.now())) {
      // Conditional delete avoids removing a newer row written after this SELECT.
      await db.runAsync('DELETE FROM public_cache WHERE cache_key = ? AND saved_at = ?', key, row.saved_at);
      return null;
    }
    if (utf8ByteLength(row.value_json) > MAX_ENTRY_BYTES) {
      await db.runAsync('DELETE FROM public_cache WHERE cache_key = ? AND saved_at = ?', key, row.saved_at);
      return null;
    }
    return { value: JSON.parse(row.value_json) as T, savedAt: row.saved_at };
  } catch {
    // Offline cache is best-effort and must not break normal API behavior.
    return null;
  }
}

export async function readPublicCache<T>(key: string): Promise<T | null> {
  const entry = await readPublicCacheEntry<T>(key);
  return entry?.value ?? null;
}

export async function writePublicCache<T>(key: string, value: T): Promise<void> {
  if (!key.trim() || key.length > 300) return;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || serialized.length > MAX_ENTRY_CHARS) return;
    const sizeBytes = utf8ByteLength(serialized);
    if (sizeBytes > MAX_ENTRY_BYTES) return;
    const db = await getDatabase();
    const now = Date.now();

    // Write, expiry cleanup and both capacity limits are one serialized transaction.
    // This prevents simultaneous writes from racing the count/byte pruning pass.
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `DELETE FROM public_cache
         WHERE (cache_key LIKE 'api-private:%' AND saved_at < ?)
            OR (cache_key NOT LIKE 'api-private:%' AND saved_at < ?)
            OR saved_at > ?`,
        now - 24 * 60 * 60 * 1_000,
        now - 7 * 24 * 60 * 60 * 1_000,
        now + 5 * 60 * 1_000,
      );
      await txn.runAsync(
        `INSERT INTO public_cache (cache_key, value_json, saved_at, size_chars, size_bytes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           value_json = excluded.value_json,
           saved_at = excluded.saved_at,
           size_chars = excluded.size_chars,
           size_bytes = excluded.size_bytes`,
        key, serialized, now, serialized.length, sizeBytes,
      );
      const rows = await txn.getAllAsync<{ cache_key: string; saved_at: number; size_bytes: number }>(
        'SELECT cache_key, saved_at, size_bytes FROM public_cache',
      );
      const evicted = planPublicCacheEviction(rows.map((row) => ({
        cacheKey: row.cache_key,
        savedAt: row.saved_at,
        sizeBytes: row.size_bytes,
      })), { maxEntries: MAX_PUBLIC_CACHE_ENTRIES, maxBytes: MAX_PUBLIC_CACHE_BYTES });
      for (const cacheKey of evicted) {
        await txn.runAsync('DELETE FROM public_cache WHERE cache_key = ?', cacheKey);
      }
    });
  } catch {
    // Cache is an optimization; storage failures must not fail a successful network request.
  }
}

/**
 * صيانة الكاش: حذف السجلات المنتهية (عامة 7 أيام / خاصة 24 ساعة / تواريخ مستقبلية شاذة).
 * الحذف كان يحدث عند الكتابة فقط، فتبقى سجلات قديمة إن لم تحدث كتابة. تُستدعى مرة واحدة
 * وقت الخمول بعد الإقلاع (انظر useDeferredStartupMaintenance). لا تمسّ جدول saved-offline.
 */
export async function prunePublicCacheExpired(): Promise<number> {
  try {
    const db = await getDatabase();
    const now = Date.now();
    const result = await db.runAsync(
      `DELETE FROM public_cache
       WHERE (cache_key LIKE 'api-private:%' AND saved_at < ?)
          OR (cache_key NOT LIKE 'api-private:%' AND saved_at < ?)
          OR saved_at > ?`,
      now - 24 * 60 * 60 * 1_000,
      now - 7 * 24 * 60 * 60 * 1_000,
      now + 5 * 60 * 1_000,
    );
    return typeof result?.changes === 'number' ? result.changes : 0;
  } catch {
    // صيانة اختيارية: فشلها لا يجب أن يؤثر على التطبيق.
    return 0;
  }
}

export async function clearPublicCache(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM public_cache');
}

/** Returns valid local image URIs referenced by API cache records or explicit offline saves. */
export async function getReferencedPublicImageUris(): Promise<Set<string>> {
  const referenced = new Set<string>();
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      if (value.startsWith('file://')) referenced.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item, depth + 1);
    }
  };

  try {
    const db = await getDatabase();
    const now = Date.now();
    const rows = await db.getAllAsync<{ cache_key: string; value_json: string; saved_at: number }>(
      'SELECT cache_key, value_json, saved_at FROM public_cache WHERE length(value_json) <= ?', MAX_ENTRY_CHARS,
    );
    for (const row of rows) {
      if (!isPublicCacheEntryUsable(row.cache_key, row.saved_at, now)) continue;
      try { visit(JSON.parse(row.value_json)); } catch { /* Ignore malformed cache rows. */ }
    }
  } catch {
    // Keep going: explicitly saved-offline records may still be readable.
  }

  try {
    const db = await getDatabase();
    // This table is created lazily by saved-offline.ts. A missing table is expected
    // before the user saves their first resource and must not fail image cleanup.
    const rows = await db.getAllAsync<{ payload_json: string }>(
      'SELECT payload_json FROM saved_offline_resources WHERE length(payload_json) <= ?', MAX_ENTRY_CHARS,
    );
    for (const row of rows) {
      try { visit(JSON.parse(row.payload_json)); } catch { /* Ignore malformed saved rows. */ }
    }
  } catch {
    // No explicit offline saves yet, or database unavailable.
  }
  return referenced;
}

/** Remove one cached representation after a successful mutation of the same resource. */
export async function deletePublicCacheEntry(key: string): Promise<void> {
  if (!key.trim() || key.length > 300) return;
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM public_cache WHERE cache_key = ?', key);
  } catch {
    // Cache invalidation is best-effort; network mutations remain authoritative.
  }
}

/** Delete a namespace of public cached reads after a resource mutation. Prefix matching is literal. */
export async function deletePublicCacheEntriesByPrefix(prefix: string): Promise<void> {
  if (!prefix.trim() || prefix.length > 280) return;
  try {
    const db = await getDatabase();
    await db.runAsync(
      'DELETE FROM public_cache WHERE substr(cache_key, 1, ?) = ?',
      prefix.length,
      prefix,
    );
  } catch {
    // Cache invalidation is best-effort; network mutations remain authoritative.
  }
}

/** Scoped private-cache invalidation: only keys for one resource prefix and one account.
 *  Use this instead of clearPrivateCache() when a mutation is confined to one domain
 *  (orders, requests, appointments, sales). Reduces unnecessary cache wipes. */
export async function clearPrivateCacheForPrefix(pathPrefix: string, ownerId: string): Promise<void> {
  if (!pathPrefix.startsWith('/api/v1/') || !ownerId.trim()) return;
  try {
    const db = await getDatabase();
    // Private keys have the shape: api-private:<encodedOwnerId>:<path>
    const fullPrefix = `api-private:${encodeURIComponent(ownerId)}:${pathPrefix}`;
    // Enforce a route boundary: /sales must not accidentally invalidate /sales-tools.
    await db.runAsync(
      `DELETE FROM public_cache
       WHERE substr(cache_key, 1, ?) = ?
         AND (length(cache_key) = ? OR substr(cache_key, ?, 1) IN ('/', '?'))`,
      fullPrefix.length,
      fullPrefix,
      fullPrefix.length,
      fullPrefix.length + 1,
    );
  } catch {
    // Cache invalidation is best-effort; the server remains authoritative.
  }
}

/** Clear all authenticated snapshots after any successful mutation. Conservative invalidation avoids stale cross-feature views. */
export async function clearPrivateCache(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM public_cache WHERE cache_key LIKE 'api-private:%'");
  } catch {
    // Cache invalidation is best-effort; the server remains authoritative.
  }
}


/** Count durable writes before logout so the UI can ask before discarding them. */
const PRIVATE_OPERATION_TABLES = [
  { name: 'mutation_outbox', ownerColumn: 'owner_id' },
  { name: 'entity_create_outbox', ownerColumn: 'owner_id' },
  { name: 'chat_message_outbox', ownerColumn: 'owner_id' },
  { name: 'chat_media_outbox', ownerColumn: 'owner_id' },
  { name: 'request_create_outbox', ownerColumn: 'owner_id' },
  { name: 'marketplace_order_outbox', ownerColumn: 'owner_id' },
  { name: 'request_offer_outbox', ownerColumn: 'owner_id' },
  // Favorites use user_id rather than the owner_id convention used by other queues.
  { name: 'favorite_state_outbox', ownerColumn: 'user_id' },
] as const;

const ACCOUNT_DATA_TABLES = [
  { name: 'mutation_outbox', ownerColumn: 'owner_id' },
  { name: 'entity_create_outbox', ownerColumn: 'owner_id' },
  { name: 'chat_message_outbox', ownerColumn: 'owner_id' },
  { name: 'chat_media_outbox', ownerColumn: 'owner_id' },
  { name: 'chat_message_cache', ownerColumn: 'owner_id' },
  { name: 'request_create_outbox', ownerColumn: 'owner_id' },
  { name: 'marketplace_order_outbox', ownerColumn: 'owner_id' },
  { name: 'request_offer_outbox', ownerColumn: 'owner_id' },
  { name: 'favorite_state_outbox', ownerColumn: 'user_id' },
  { name: 'ad_drafts', ownerColumn: 'owner_id' },
  { name: 'ad_edit_drafts', ownerColumn: 'owner_id' },
  { name: 'mobile_saved_payees', ownerColumn: 'owner_id' },
  { name: 'mobile_saved_net_cards', ownerColumn: 'owner_id' },
] as const;


function isOwnedChatMediaUri(uri: unknown, ownedDirectory: string, documentDirectory: string | null): uri is string {
  if (!documentDirectory || typeof uri !== 'string' || !uri.startsWith(ownedDirectory)) return false;
  const fileName = uri.slice(ownedDirectory.length);
  // Files are created with a sanitized flat filename in this exact app-owned folder.
  // Reject separators, dot segments and URI escapes instead of trusting a prefix check.
  return Boolean(fileName && fileName !== '.' && fileName !== '..' && /^[A-Za-z0-9._-]+$/.test(fileName));
}

async function tableHasColumn(
  db: Pick<SQLite.SQLiteDatabase, 'getAllAsync'>,
  table: string,
  column: string,
): Promise<boolean> {
  // Both identifiers come from the static allowlists above, never from user input.
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
}

export async function countPendingPrivateMobileOperations(ownerId?: string | null): Promise<number> {
  const owner = ownerId?.trim();
  if (ownerId !== undefined && !owner) {
    // Supplying an owner is an explicit request for an account-scoped count.
    // Never silently widen an invalid scope into a device-wide aggregate.
    throw new Error('A valid account owner is required for scoped pending-operation counts.');
  }

  const db = await getDatabase();
  let total = 0;

  for (const table of PRIVATE_OPERATION_TABLES) {
    const exists = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table.name,
    );
    if (!exists) continue;

    // A scoped count must never include another account's rows or legacy rows whose
    // owner cannot be established. Keep the no-owner form for legacy maintenance/tests.
    if (owner && !(await tableHasColumn(db, table.name, table.ownerColumn))) continue;
    const count = owner
      ? await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${table.name} WHERE ${table.ownerColumn} = ?`, owner,
        )
      : await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.name}`);
    total += Math.max(0, Number(count?.count ?? 0));
  }
  return total;
}

/**
 * Delete private data either globally (legacy maintenance only) or for one explicit
 * account. Normal logout paths must pass ownerId so another account's offline work
 * on the same device is never counted or erased.
 */
export async function clearPrivateMobileData(ownerId?: string | null): Promise<void> {
  const owner = ownerId?.trim() || null;
  if (ownerId !== undefined && !owner) {
    // Only an omitted argument is allowed to invoke legacy/global maintenance cleanup.
    throw new Error('A valid account owner is required for scoped local-data cleanup.');
  }

  const db = await getDatabase();
  const mediaUris: string[] = [];
  const ownedDirectory = `${FileSystem.documentDirectory ?? ''}marketplat-chat-media-outbox/`;

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (owner) {
      for (const table of ACCOUNT_DATA_TABLES) {
        const exists = await txn.getFirstAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table.name,
        );
        if (!exists || !(await tableHasColumn(txn, table.name, table.ownerColumn))) continue;

        if (table.name === 'chat_media_outbox' && FileSystem.documentDirectory) {
          const rows = await txn.getAllAsync<{ uri: string }>(
            'SELECT uri FROM chat_media_outbox WHERE owner_id = ?', owner,
          );
          for (const row of rows) {
            if (isOwnedChatMediaUri(row.uri, ownedDirectory, FileSystem.documentDirectory)) mediaUris.push(row.uri);
          }
        }
        await txn.runAsync(
          `DELETE FROM ${table.name} WHERE ${table.ownerColumn} = ?`, owner,
        );
      }

      // Private API cache keys are namespaced by the encoded account id.
      const ownerPrefix = `api-private:${encodeURIComponent(owner)}:`;
      const cacheExists = await txn.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_cache'",
      );
      if (cacheExists) {
        await txn.runAsync(
          'DELETE FROM public_cache WHERE substr(cache_key, 1, ?) = ?',
          ownerPrefix.length, ownerPrefix,
        );
      }
      return;
    }

    // Legacy/global reset path. Account-level code must not call this overload.
    const legacyTables = [
      ...ACCOUNT_DATA_TABLES.map((table) => table.name),
      'offline_creation_reference_cache',
    ];
    for (const table of legacyTables) {
      const exists = await txn.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table,
      );
      if (!exists) continue;
      if (table === 'chat_media_outbox' && FileSystem.documentDirectory) {
        const rows = await txn.getAllAsync<{ uri: string }>('SELECT uri FROM chat_media_outbox');
        for (const row of rows) {
          if (isOwnedChatMediaUri(row.uri, ownedDirectory, FileSystem.documentDirectory)) mediaUris.push(row.uri);
        }
      }
      await txn.runAsync(`DELETE FROM ${table}`);
    }

    const cacheExists = await txn.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_cache'",
    );
    if (cacheExists) await txn.runAsync("DELETE FROM public_cache WHERE cache_key LIKE 'api-private:%'");
  });

  // Only delete files after the DB transaction committed. Never delete arbitrary file:// or content:// URIs.
  await Promise.all([...new Set(mediaUris)].map((uri) =>
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined),
  ));
}
