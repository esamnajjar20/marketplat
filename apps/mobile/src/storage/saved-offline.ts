import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import { cachePublicImages, filterAvailablePublicImageUris, prunePublicImageCache } from '@/storage/public-image-cache';

export type SavedOfflineKind = 'ad' | 'product' | 'store';
export type SavedOfflineItem = {
  id: string;
  kind: SavedOfflineKind;
  title: string;
  payload: Record<string, unknown>;
  savedAt: number;
};

type SavedOfflineRow = { id: string; kind: SavedOfflineKind; title: string; payload_json: string; saved_at: number };

async function ensureTable() {
  const db = await openEncryptedDatabaseAsync();
  await db.execAsync(`CREATE TABLE IF NOT EXISTS saved_offline_resources (
    id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('ad','product','store')),
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
  ); CREATE INDEX IF NOT EXISTS saved_offline_resources_saved_at_idx ON saved_offline_resources(saved_at DESC);`);
  return db;
}

/** Explicit user bookmarks are stored separately from the public response cache. */
export type SaveOfflineResult = { requestedImages: number; cachedImages: number };

export async function saveOfflineResource(input: { id: string; kind: SavedOfflineKind; title: string; payload: Record<string, unknown> }): Promise<SaveOfflineResult> {
  if (!input.id.trim() || !input.title.trim()) throw new Error('تعذر حفظ محتوى غير مكتمل.');
  const rawImages = input.payload.images;
  let payload = input.payload;
  let requestedImages = 0;
  let cachedImages = 0;
  if (Array.isArray(rawImages)) {
    const allImageUris = rawImages.filter((uri): uri is string => typeof uri === 'string');
    requestedImages = allImageUris.length;
    const requested = allImageUris.slice(0, 8);
    if (requested.length) {
      // Download first, prune against existing durable references, then retain only
      // app-owned files that survived the storage budget. Remote URLs are not offline assets.
      const downloaded = await cachePublicImages(requested).catch(() => []);
      await prunePublicImageCache();
      const localImages = await filterAvailablePublicImageUris(downloaded);
      cachedImages = localImages.length;
      payload = { ...payload, images: localImages };
    }
  }
  const db = await ensureTable();
  const serialized = JSON.stringify(payload);
  if (serialized.length > 480_000) throw new Error('حجم المحتوى أكبر من الحد المسموح للحفظ دون اتصال.');
  await db.runAsync(
    `INSERT INTO saved_offline_resources (id, kind, title, payload_json, saved_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET title=excluded.title, payload_json=excluded.payload_json, saved_at=excluded.saved_at`,
    input.id, input.kind, input.title.trim(), serialized, Date.now(),
  );
  // Now image references are durable and the pruner can safely protect them.
  await prunePublicImageCache();
  return { requestedImages, cachedImages };
}

export async function listSavedOfflineResources(): Promise<SavedOfflineItem[]> {
  const db = await ensureTable();
  const rows = await db.getAllAsync<SavedOfflineRow>('SELECT id, kind, title, payload_json, saved_at FROM saved_offline_resources ORDER BY saved_at DESC LIMIT 200');
  return rows.flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      return [{ id: row.id, kind: row.kind, title: row.title, payload, savedAt: row.saved_at }];
    } catch { return []; }
  });
}

export async function removeSavedOfflineResource(kind: SavedOfflineKind, id: string): Promise<void> {
  const db = await ensureTable();
  await db.runAsync('DELETE FROM saved_offline_resources WHERE kind = ? AND id = ?', kind, id);
}

export async function isSavedOfflineResource(kind: SavedOfflineKind, id: string): Promise<boolean> {
  const db = await ensureTable();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM saved_offline_resources WHERE kind = ? AND id = ? LIMIT 1', kind, id);
  return !!row;
}
