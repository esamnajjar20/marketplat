import * as SQLite from 'expo-sqlite';
import { ApiError, apiRequest } from '@/api/client';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';

type RequestPayload = { type: 'SERVICE' | 'PRODUCT' | 'RENTAL'; categoryId: string; title: string; description: string; city?: string; budgetMin?: number; budgetMax?: number };
export type PendingRequestOutboxItem = { id: string; ownerId: string; payload: RequestPayload; createdAt: number; attempts: number; lastError: string | null; nextAttemptAt: number };
type Row = { id: string; owner_id: string; payload_json: string; created_at: number; attempts: number; last_error: string | null; next_attempt_at: number; state: string };
const DB_NAME = 'marketplat-public-cache.db';
const MAX_PENDING = 50;
const MAX_ATTEMPTS = 8;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const activeSyncByOwner = new Map<string, Promise<'synced' | 'discarded' | 'nothing-due' | 'retry-scheduled' | 'login-required'>>();
async function database() {
  if (!dbPromise) dbPromise = openEncryptedDatabaseAsync(DB_NAME).then(async (db) => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS request_create_outbox (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      next_attempt_at INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0
    ); CREATE INDEX IF NOT EXISTS request_create_outbox_owner_created_idx ON request_create_outbox(owner_id, created_at);`);
    await db.runAsync("UPDATE request_create_outbox SET state='pending', lease_until=0, next_attempt_at=MAX(next_attempt_at, ?) WHERE state='processing' AND lease_until <= ?", Date.now() + 5000, Date.now());
    return db;
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}
function map(row: Row, payload: RequestPayload): PendingRequestOutboxItem { return { id: row.id, ownerId: row.owner_id, payload, createdAt: row.created_at, attempts: row.attempts, lastError: row.last_error, nextAttemptAt: row.next_attempt_at }; }
function validatePayload(value: unknown): asserts value is RequestPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('بيانات الطلب المحفوظ غير صالحة.');
  const p = value as Record<string, unknown>;
  if (!['SERVICE', 'PRODUCT', 'RENTAL'].includes(String(p.type)) || typeof p.categoryId !== 'string' || !p.categoryId.trim() || typeof p.title !== 'string' || p.title.trim().length < 5 || typeof p.description !== 'string' || p.description.trim().length < 10 || (p.city !== undefined && typeof p.city !== 'string') || (p.budgetMin !== undefined && (typeof p.budgetMin !== 'number' || !Number.isFinite(p.budgetMin) || p.budgetMin < 0)) || (p.budgetMax !== undefined && (typeof p.budgetMax !== 'number' || !Number.isFinite(p.budgetMax) || p.budgetMax <= 0))) throw new Error('بيانات الطلب لا تطابق قواعد الحفظ دون اتصال.');
}
export async function enqueueMarketplaceRequest(ownerId: string, id: string, payload: RequestPayload): Promise<void> {
  if (!ownerId.trim() || ownerId.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(id)) throw new Error('معرّف الحساب أو العملية غير صالح.');
  validatePayload(payload);
  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const count = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM request_create_outbox WHERE owner_id=?", ownerId);
    if ((count?.count ?? 0) >= MAX_PENDING) throw new Error('طابور الطلبات دون اتصال ممتلئ؛ اتصل بالإنترنت للمزامنة أولًا.');
    await tx.runAsync('INSERT INTO request_create_outbox (id,owner_id,payload_json,created_at,attempts,last_error,next_attempt_at,state,lease_until) VALUES (?,?,?,?,0,NULL,0,\'pending\',0)', id, ownerId, JSON.stringify(payload), Date.now());
  });
}
export async function listPendingMarketplaceRequests(ownerId?: string | null): Promise<PendingRequestOutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<Row>('SELECT * FROM request_create_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT ?', ownerId, MAX_PENDING);
  return rows.flatMap((r) => { try { const p: unknown = JSON.parse(r.payload_json); validatePayload(p); return [map(r, p)]; } catch { return [{ id:r.id, ownerId:r.owner_id, payload:{type:'SERVICE',categoryId:'',title:'طلب غير صالح',description:'بيانات غير صالحة'}, createdAt:r.created_at, attempts:r.attempts, lastError:r.last_error ?? 'بيانات محفوظة غير صالحة', nextAttemptAt:r.next_attempt_at }]; } });
}

export async function discardMarketplaceRequest(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync("DELETE FROM request_create_outbox WHERE id=? AND owner_id=? AND state='pending'", id, ownerId);
  return result.changes === 1;
}
/** Called by the sync worker when the server permanently rejects a request
 *  (400/404/422). Deletes immediately so the FIFO queue doesn't stall forever. */
export async function discardRejectedMarketplaceRequest(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const r = await db.runAsync("DELETE FROM request_create_outbox WHERE id=? AND owner_id=? AND state='processing'", id, ownerId);
  return r.changes === 1;
}

export async function retryMarketplaceRequest(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync("UPDATE request_create_outbox SET attempts=0,last_error=NULL,next_attempt_at=0,state='pending',lease_until=0 WHERE id=? AND owner_id=? AND state='pending' AND attempts>=?", id, ownerId, MAX_ATTEMPTS);
  return result.changes === 1;
}

export async function syncNextMarketplaceRequest(input: { isOnline: boolean; token?: string | null; ownerId?: string | null; csrfToken?: string | null }): Promise<'synced' | 'discarded' | 'nothing-due' | 'retry-scheduled' | 'login-required'> {
  const key = input.ownerId?.trim() || '__missing_owner__';
  const existing = activeSyncByOwner.get(key);
  if (existing) return existing;
  const work = (async () => {
    if (!input.isOnline) return 'nothing-due' as const;
    if (!input.token?.trim() || !input.ownerId?.trim()) return 'login-required' as const;
    const db = await database();
    const now = Date.now();
    await db.runAsync("UPDATE request_create_outbox SET state='pending',lease_until=0,next_attempt_at=MAX(next_attempt_at,?) WHERE state='processing' AND lease_until<=?", now + 5000, now);
    const head = await db.getFirstAsync<Row>('SELECT * FROM request_create_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT 1', input.ownerId);
    if (!head || head.next_attempt_at > now || head.attempts >= MAX_ATTEMPTS || head.state === 'processing') return 'nothing-due' as const;
    const lease = now + 30_000;
    const claimed = await db.runAsync("UPDATE request_create_outbox SET state='processing',lease_until=? WHERE id=? AND owner_id=? AND state='pending' AND next_attempt_at<=?", lease, head.id, input.ownerId, now);
    if (claimed.changes !== 1) return 'nothing-due' as const;
    try {
      const payload: unknown = JSON.parse(head.payload_json); validatePayload(payload);
      const response = await apiRequest<{ success: boolean; message?: string; data?: unknown }>('/api/v1/requests', { method: 'POST', token: input.token, headers: { 'X-Offline-Op-Id': head.id, ...(input.csrfToken ? { 'X-CSRF-Token': input.csrfToken } : {}) }, body: JSON.stringify(payload), timeoutMs: 12_000 });
      if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || 'لم يؤكد الخادم إنشاء الطلب.');
      await db.runAsync('DELETE FROM request_create_outbox WHERE id=? AND owner_id=? AND state=\'processing\'', head.id, input.ownerId);
      return 'synced' as const;
    } catch (error) {
      // Permanent server rejection — discard so the FIFO queue doesn't stall forever.
      if (error instanceof ApiError && error.status && [400, 404, 422].includes(error.status)) {
        await db.runAsync('DELETE FROM request_create_outbox WHERE id=? AND owner_id=? AND state=\'processing\'', head.id, input.ownerId);
        return 'discarded' as const;
      }
      const attempts = head.attempts + 1;
      const delay = Math.min(60 * 60_000, 5_000 * 2 ** Math.min(attempts - 1, 10));
      const message = (error instanceof Error ? error.message : 'تعذرت مزامنة الطلب.').slice(0, 500);
      await db.runAsync("UPDATE request_create_outbox SET state='pending', attempts=?, last_error=?, next_attempt_at=?, lease_until=0 WHERE id=? AND owner_id=?", attempts, message, Date.now() + delay, head.id, input.ownerId);
      return error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'login-required' as const : 'retry-scheduled' as const;
    }
  })();
  activeSyncByOwner.set(key, work);
  void work.finally(() => { if (activeSyncByOwner.get(key) === work) activeSyncByOwner.delete(key); }).catch(() => undefined);
  return work;
}
