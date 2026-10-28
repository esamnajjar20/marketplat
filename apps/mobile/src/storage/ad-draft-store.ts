import * as SQLite from 'expo-sqlite';
import type { AdDraft } from '@/features/ads/manage-ads.api';
import { runSerializedByKey } from './draft-operation-queue.mjs';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_DRAFT_CHARS = 100_000;
export type SavedAdDraft = { ownerId: string; draft: AdDraft; updatedAt: number };
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS ad_drafts (
        owner_id TEXT PRIMARY KEY NOT NULL,
        draft_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`);
      await db.execAsync(`CREATE TABLE IF NOT EXISTS ad_edit_drafts (
        owner_id TEXT NOT NULL, resource_id TEXT NOT NULL, draft_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY(owner_id, resource_id)
      );`);
      return db;
    })().catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

function validDraft(value: unknown): value is AdDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<AdDraft>;
  return typeof draft.title === 'string' && typeof draft.description === 'string'
    && typeof draft.price === 'string' && typeof draft.city === 'string'
    && typeof draft.categoryId === 'string' && typeof draft.isNegotiable === 'boolean'
    && Array.isArray(draft.images) && draft.images.length <= 10
    && draft.images.every((image) => Boolean(image && typeof image.uri === 'string'
      && typeof image.fileName === 'string' && typeof image.mimeType === 'string'));
}

/** Save only user-authored draft data; never pass auth tokens or session data here. */
export async function saveAdDraft(ownerId: string, draft: AdDraft): Promise<string[]> {
  if (!ownerId.trim() || ownerId.length > 160) throw new Error('A valid draft owner is required.');
  if (!validDraft(draft)) throw new Error('Invalid ad draft.');
  const draftJson = JSON.stringify(draft);
  if (draftJson.length > MAX_DRAFT_CHARS) throw new Error('Ad draft exceeds the allowed local size.');

  // Serialize read-diff-write per account: overlapping debounce callbacks must not
  // allow an older snapshot to overwrite a newer one or report wrong cleanup URIs.
  return runSerializedByKey(ownerId, async () => {
    const db = await database();
    const previous = await db.getFirstAsync<{ draft_json: string }>(
      'SELECT draft_json FROM ad_drafts WHERE owner_id = ?', ownerId,
    );
    let previousUris: string[] = [];
    if (previous) {
      try {
        const oldDraft: unknown = JSON.parse(previous.draft_json);
        if (validDraft(oldDraft)) previousUris = oldDraft.images.map((image) => image.uri);
      } catch { /* malformed old data is retained conservatively; no cleanup candidates */ }
    }
    await db.runAsync(
      `INSERT INTO ad_drafts (owner_id, draft_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET draft_json = excluded.draft_json, updated_at = excluded.updated_at`,
      ownerId, draftJson, Date.now(),
    );
    const currentUris = new Set(draft.images.map((image) => image.uri));
    return [...new Set(previousUris)].filter((uri) => !currentUris.has(uri));
  });
}

export async function loadAdDraft(ownerId: string): Promise<SavedAdDraft | null> {
  if (!ownerId.trim()) return null;
  const db = await database();
  const row = await db.getFirstAsync<{ owner_id: string; draft_json: string; updated_at: number }>(
    'SELECT owner_id, draft_json, updated_at FROM ad_drafts WHERE owner_id = ?', ownerId,
  );
  if (!row) return null;
  try {
    const draft: unknown = JSON.parse(row.draft_json);
    if (!validDraft(draft)) return null;
    return { ownerId: row.owner_id, draft, updatedAt: row.updated_at };
  } catch { return null; }
}

export async function clearAdDraft(ownerId: string): Promise<boolean> {
  if (!ownerId.trim()) return false;
  // Queue deletion behind any in-flight save so a late autosave cannot recreate
  // the submitted draft after the server has accepted the ad.
  return runSerializedByKey(ownerId, async () => {
    const db = await database();
    const result = await db.runAsync('DELETE FROM ad_drafts WHERE owner_id = ?', ownerId);
    return result.changes === 1;
  });
}

/** Conservative reference check used by image cleanup to keep files needed by a saved draft. */
export async function isAdImageReferencedByDraft(uri: string): Promise<boolean> {
  if (!uri) return false;
  const db = await database();
  const rows = await db.getAllAsync<{ draft_json: string }>('SELECT draft_json FROM ad_drafts UNION ALL SELECT draft_json FROM ad_edit_drafts');
  for (const row of rows) {
    try {
      const draft: unknown = JSON.parse(row.draft_json);
      if (!validDraft(draft)) return true;
      if (draft.images.some((image) => image.uri === uri)) return true;
    } catch { return true; }
  }
  return false;
}


/** Durable per-ad edit draft. This is local-only and is not an automatic sync queue. */
export async function saveAdEditDraft(ownerId: string, resourceId: string, draft: AdDraft): Promise<void> {
  if (!ownerId.trim() || ownerId.length > 160) throw new Error('A valid draft owner is required.');
  if (!resourceId.trim() || resourceId.length > 160) throw new Error('A valid ad ID is required.');
  if (!validDraft(draft)) throw new Error('Invalid ad edit draft.');
  const draftJson = JSON.stringify(draft);
  if (draftJson.length > MAX_DRAFT_CHARS) throw new Error('Ad edit draft exceeds the allowed local size.');
  return runSerializedByKey(`${ownerId}:${resourceId}`, async () => {
    const db = await database();
    await db.runAsync(`INSERT INTO ad_edit_drafts (owner_id, resource_id, draft_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, resource_id) DO UPDATE SET draft_json = excluded.draft_json, updated_at = excluded.updated_at`,
      ownerId, resourceId, draftJson, Date.now());
  });
}

export async function loadAdEditDraft(ownerId: string, resourceId: string): Promise<SavedAdDraft | null> {
  if (!ownerId.trim() || !resourceId.trim()) return null;
  const db = await database();
  const row = await db.getFirstAsync<{ owner_id: string; draft_json: string; updated_at: number }>(
    'SELECT owner_id, draft_json, updated_at FROM ad_edit_drafts WHERE owner_id = ? AND resource_id = ?', ownerId, resourceId);
  if (!row) return null;
  try { const draft: unknown = JSON.parse(row.draft_json); if (!validDraft(draft)) return null;
    return { ownerId: row.owner_id, draft, updatedAt: row.updated_at }; } catch { return null; }
}

export async function clearAdEditDraft(ownerId: string, resourceId: string): Promise<boolean> {
  if (!ownerId.trim() || !resourceId.trim()) return false;
  return runSerializedByKey(`${ownerId}:${resourceId}`, async () => {
    const db = await database();
    const result = await db.runAsync('DELETE FROM ad_edit_drafts WHERE owner_id = ? AND resource_id = ?', ownerId, resourceId);
    return result.changes === 1;
  });
}

export type AdDraftStorageSummary = { drafts: number; editDrafts: number; sizeBytes: number; newestUpdatedAt: number | null };

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Aggregate only current-account metadata; DB errors throw so the UI never reports a false empty state. */
export async function getAdDraftStorageSummary(ownerId: string): Promise<AdDraftStorageSummary> {
  if (!ownerId.trim()) throw new Error('A valid account is required to inspect draft storage.');
  const db = await database();
  const [createRows, editRows] = await Promise.all([
    db.getAllAsync<{ draft_json: string; updated_at: number }>(
      'SELECT draft_json, updated_at FROM ad_drafts WHERE owner_id = ?', ownerId,
    ),
    db.getAllAsync<{ draft_json: string; updated_at: number }>(
      'SELECT draft_json, updated_at FROM ad_edit_drafts WHERE owner_id = ?', ownerId,
    ),
  ]);
  const allRows = [...createRows, ...editRows];
  const newestUpdatedAt = allRows.reduce<number | null>((latest, row) => latest === null || row.updated_at > latest ? row.updated_at : latest, null);
  const sizeBytes = allRows.reduce((total, row) => total + utf8ByteLength(row.draft_json), 0);
  return { drafts: createRows.length, editDrafts: editRows.length, sizeBytes, newestUpdatedAt };
}
