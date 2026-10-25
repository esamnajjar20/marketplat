import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_ENTRY_CHARS = 500_000;
const MAX_ENTRIES = 100;
const MAX_TOTAL_CHARS = 3_000_000;

type CacheRow = { value_json: string; saved_at: number };

export type PublicCacheEntry<T> = { value: T; savedAt: number };
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS public_cache (
          cache_key TEXT PRIMARY KEY NOT NULL,
          value_json TEXT NOT NULL,
          saved_at INTEGER NOT NULL,
          size_chars INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS public_cache_saved_at_idx ON public_cache(saved_at);
      `);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** SQLite-backed cache for public read-only data; never store auth/session secrets here. */
export async function readPublicCacheEntry<T>(key: string): Promise<PublicCacheEntry<T> | null> {
  if (!key.trim() || key.length > 300) return null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CacheRow>(
      'SELECT value_json, saved_at FROM public_cache WHERE cache_key = ?', key,
    );
    if (!row || row.value_json.length > MAX_ENTRY_CHARS || !Number.isFinite(row.saved_at)) return null;
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
    if (serialized.length > MAX_ENTRY_CHARS) return;
    const db = await getDatabase();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO public_cache (cache_key, value_json, saved_at, size_chars)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         value_json = excluded.value_json,
         saved_at = excluded.saved_at,
         size_chars = excluded.size_chars`,
      key, serialized, now, serialized.length,
    );

    // Bound cache growth: evict oldest entries first, never evict auth data (not stored here).
    await db.runAsync(
      `DELETE FROM public_cache WHERE cache_key IN (
         SELECT cache_key FROM public_cache ORDER BY saved_at DESC LIMIT -1 OFFSET ?
       )`, MAX_ENTRIES,
    );
    const total = await db.getFirstAsync<{ total_chars: number }>(
      'SELECT COALESCE(SUM(size_chars), 0) AS total_chars FROM public_cache',
    );
    if ((total?.total_chars ?? 0) > MAX_TOTAL_CHARS) {
      await db.runAsync(
        `DELETE FROM public_cache WHERE cache_key IN (
           SELECT cache_key FROM public_cache ORDER BY saved_at ASC
           LIMIT (SELECT MAX(1, COUNT(*) / 4) FROM public_cache)
         )`,
      );
    }
  } catch {
    // Cache is an optimization; storage failures must not fail a successful network request.
  }
}

export async function clearPublicCache(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM public_cache');
  } catch {
    // Clearing a nonessential cache should not crash the app.
  }
}

/** Returns local file URIs referenced by saved public cache records so image eviction cannot break offline records. */
export async function getReferencedPublicImageUris(): Promise<Set<string>> {
  const referenced = new Set<string>();
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ value_json: string }>(
      'SELECT value_json FROM public_cache WHERE length(value_json) <= ?', MAX_ENTRY_CHARS,
    );
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
    for (const row of rows) {
      try { visit(JSON.parse(row.value_json)); } catch { /* Ignore malformed cache rows. */ }
    }
  } catch {
    // If SQLite is unavailable, return an empty set; image cache remains best-effort.
  }
  return referenced;
}
