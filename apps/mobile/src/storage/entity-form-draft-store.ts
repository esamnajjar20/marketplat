import * as SQLite from 'expo-sqlite';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import { runSerializedByKey } from '@/storage/draft-operation-queue';

const DATABASE_NAME = 'marketplat-private-v2.db';
const MAX_DRAFT_CHARS = 180_000;
export type SavedEntityFormDraft<T> = { ownerId: string; formKey: string; resourceId: string; draft: T; updatedAt: number };
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openEncryptedDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS entity_form_drafts (
        owner_id TEXT NOT NULL,
        form_key TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        draft_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(owner_id, form_key, resource_id)
      );
      CREATE INDEX IF NOT EXISTS entity_form_drafts_owner_updated_idx ON entity_form_drafts(owner_id, updated_at);`);
      return db;
    }).catch((error) => { databasePromise = null; throw error; });
  }
  return databasePromise;
}

function assertKeys(ownerId: string, formKey: string, resourceId: string): void {
  if (!ownerId.trim() || ownerId.length > 160 || !/^[a-z][a-z0-9-]{1,49}$/i.test(formKey) || !resourceId.trim() || resourceId.length > 160) {
    throw new Error('معرّفات المسودة غير صالحة.');
  }
}

function assertNoCredentials(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('عمق بيانات المسودة يتجاوز الحد المسموح.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(access[_-]?token|refresh[_-]?token|authorization|cookie|password|passwd|secret|api[_-]?key|csrf[_-]?token|session[_-]?token|jwt)$/i.test(key)) {
      throw new Error('لا يمكن حفظ بيانات اعتماد ضمن المسودة.');
    }
    assertNoCredentials(child, depth + 1);
  }
}

/** Store only user-entered form data and app-private image URIs; never credentials or session tokens. */
export async function saveEntityFormDraft<T>(ownerId: string, formKey: string, resourceId: string, draft: T): Promise<void> {
  assertKeys(ownerId, formKey, resourceId);
  assertNoCredentials(draft);
  const draftJson = JSON.stringify(draft);
  if (draftJson.length > MAX_DRAFT_CHARS) throw new Error('حجم المسودة يتجاوز الحد المسموح للحفظ المحلي.');
  const queueKey = `${ownerId}:${formKey}:${resourceId}`;
  await runSerializedByKey(queueKey, async () => {
    const db = await database();
    await db.runAsync(`INSERT INTO entity_form_drafts (owner_id, form_key, resource_id, draft_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, form_key, resource_id) DO UPDATE SET draft_json=excluded.draft_json, updated_at=excluded.updated_at`,
      ownerId, formKey, resourceId, draftJson, Date.now());
  });
}

export async function loadEntityFormDraft<T>(ownerId: string, formKey: string, resourceId: string): Promise<SavedEntityFormDraft<T> | null> {
  assertKeys(ownerId, formKey, resourceId);
  const db = await database();
  const row = await db.getFirstAsync<{ owner_id: string; form_key: string; resource_id: string; draft_json: string; updated_at: number }>(
    'SELECT owner_id, form_key, resource_id, draft_json, updated_at FROM entity_form_drafts WHERE owner_id=? AND form_key=? AND resource_id=?',
    ownerId, formKey, resourceId,
  );
  if (!row || row.draft_json.length > MAX_DRAFT_CHARS) return null;
  try {
    const draft = JSON.parse(row.draft_json) as T;
    assertNoCredentials(draft);
    return { ownerId: row.owner_id, formKey: row.form_key, resourceId: row.resource_id, draft, updatedAt: row.updated_at };
  } catch { return null; }
}

export async function clearEntityFormDraft(ownerId: string, formKey: string, resourceId: string): Promise<boolean> {
  assertKeys(ownerId, formKey, resourceId);
  return runSerializedByKey(`${ownerId}:${formKey}:${resourceId}`, async () => {
    const db = await database();
    const result = await db.runAsync('DELETE FROM entity_form_drafts WHERE owner_id=? AND form_key=? AND resource_id=?', ownerId, formKey, resourceId);
    return result.changes > 0;
  });
}
