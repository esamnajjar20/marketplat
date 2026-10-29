import * as SQLite from 'expo-sqlite';
import { ApiError, apiRequest } from '@/api/client';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';

type OfferPayload = { requestId: string; price: number; message?: string; operationId: string };
export type PendingRequestOfferItem = { id: string; ownerId: string; payload: OfferPayload; createdAt: number; attempts: number; lastError: string | null; nextAttemptAt: number; state: string };
type Row = { id: string; owner_id: string; payload_json: string; created_at: number; attempts: number; last_error: string | null; next_attempt_at: number; state: string; lease_until: number };
const DB_NAME = 'marketplat-public-cache.db'; const MAX_PENDING = 50; const MAX_ATTEMPTS = 8;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const activeSyncByOwner = new Map<string, Promise<'synced' | 'discarded' | 'nothing-due' | 'retry-scheduled' | 'login-required'>>();
async function database() {
  if (!dbPromise) dbPromise = openEncryptedDatabaseAsync(DB_NAME).then(async db => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS request_offer_outbox (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      next_attempt_at INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0
    ); CREATE INDEX IF NOT EXISTS request_offer_outbox_owner_created_idx ON request_offer_outbox(owner_id, created_at);`);
    await db.runAsync("UPDATE request_offer_outbox SET state='pending',lease_until=0,next_attempt_at=MAX(next_attempt_at,?) WHERE state='processing' AND lease_until<=?", Date.now()+5000, Date.now());
    return db;
  }).catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}
function validate(value: unknown): asserts value is OfferPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('بيانات العرض المحفوظ غير صالحة.');
  const p = value as Record<string, unknown>;
  if (typeof p.requestId !== 'string' || !p.requestId.trim() || p.requestId.length > 160 || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0 || Math.round(p.price * 100) !== p.price * 100 || (p.message !== undefined && (typeof p.message !== 'string' || p.message.length > 1000)) || typeof p.operationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(p.operationId)) throw new Error('بيانات العرض لا تطابق قواعد الحفظ دون اتصال.');
}
function mapRow(row: Row): PendingRequestOfferItem { let payload: OfferPayload; try { const v: unknown = JSON.parse(row.payload_json); validate(v); payload = v; } catch { payload = { requestId: '', price: 0, operationId: row.id }; } return { id: row.id, ownerId: row.owner_id, payload, createdAt: row.created_at, attempts: row.attempts, lastError: row.last_error, nextAttemptAt: row.next_attempt_at, state: row.state }; }
export async function enqueueRequestOffer(ownerId: string, requestId: string, price: number, message?: string): Promise<void> {
  const payload: OfferPayload = { requestId, price, ...(message?.trim() ? { message: message.trim() } : {}), operationId: `offline-offer:${Date.now()}:${Math.random().toString(36).slice(2,12)}` };
  if (!ownerId.trim() || ownerId.length > 160) throw new Error('تعذر تحديد الحساب المالك للعرض.'); validate(payload);
  const db = await database(); await db.withExclusiveTransactionAsync(async tx => {
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM request_offer_outbox WHERE owner_id=? AND id=?', ownerId, payload.operationId); if (existing) return;
    const count = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM request_offer_outbox WHERE owner_id=? AND state IN ('pending','processing')", ownerId);
    if ((count?.count ?? 0) >= MAX_PENDING) throw new Error('طابور العروض دون اتصال ممتلئ؛ اتصل بالإنترنت للمزامنة أولًا.');
    await tx.runAsync("INSERT INTO request_offer_outbox (id,owner_id,payload_json,created_at,attempts,last_error,next_attempt_at,state,lease_until) VALUES (?,?,?, ?,0,NULL,0,'pending',0)", payload.operationId, ownerId, JSON.stringify(payload), Date.now());
  });
}
export async function listPendingRequestOffers(ownerId?: string | null): Promise<PendingRequestOfferItem[]> { if (!ownerId?.trim()) return []; const db = await database(); const rows = await db.getAllAsync<Row>('SELECT * FROM request_offer_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT ?', ownerId, MAX_PENDING); return rows.map(mapRow); }
export async function discardRequestOffer(id: string, ownerId?: string | null): Promise<boolean> { if (!id.trim() || !ownerId?.trim()) return false; const db = await database(); const r = await db.runAsync("DELETE FROM request_offer_outbox WHERE id=? AND owner_id=? AND state='pending'", id, ownerId); return r.changes === 1; }
/** Called by the sync worker when the server permanently rejects an offer
 *  (400/404/422). Deletes immediately so the FIFO queue doesn't stall forever. */
export async function discardRejectedRequestOffer(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const r = await db.runAsync("DELETE FROM request_offer_outbox WHERE id=? AND owner_id=? AND state='processing'", id, ownerId);
  return r.changes === 1;
}

export async function retryRequestOffer(id: string, ownerId?: string | null): Promise<boolean> { if (!id.trim() || !ownerId?.trim()) return false; const db = await database(); const r = await db.runAsync("UPDATE request_offer_outbox SET attempts=0,last_error=NULL,next_attempt_at=0,state='pending',lease_until=0 WHERE id=? AND owner_id=? AND state='pending' AND attempts>=?", id, ownerId, MAX_ATTEMPTS); return r.changes === 1; }
export async function syncNextRequestOffer(input: { isOnline: boolean; token?: string | null; ownerId?: string | null; csrfToken?: string | null }): Promise<'synced' | 'discarded' | 'nothing-due' | 'retry-scheduled' | 'login-required'> {
  const key = input.ownerId?.trim() || '__missing_owner__';
  const existing = activeSyncByOwner.get(key);
  if (existing) return existing;
  const work = (async () => {
    if (!input.isOnline) return 'nothing-due' as const; if (!input.token?.trim() || !input.ownerId?.trim()) return 'login-required' as const;
    const db = await database(); const now = Date.now(); await db.runAsync("UPDATE request_offer_outbox SET state='pending',lease_until=0,next_attempt_at=MAX(next_attempt_at,?) WHERE state='processing' AND lease_until<=?", now + 5000, now); const head = await db.getFirstAsync<Row>('SELECT * FROM request_offer_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT 1', input.ownerId);
    if (!head || head.next_attempt_at > now || head.attempts >= MAX_ATTEMPTS || head.state === 'processing') return 'nothing-due' as const;
    const claimed = await db.runAsync("UPDATE request_offer_outbox SET state='processing',lease_until=? WHERE id=? AND owner_id=? AND state='pending' AND next_attempt_at<=?", now+30000, head.id, input.ownerId, now); if (claimed.changes !== 1) return 'nothing-due' as const;
    try {
      const raw: unknown = JSON.parse(head.payload_json); validate(raw); const payload = raw as OfferPayload;
      const response = await apiRequest<{ success: boolean; message?: string; data?: unknown }>(`/api/v1/requests/${encodeURIComponent(payload.requestId)}/offers`, { method: 'POST', token: input.token, headers: { 'X-Offline-Op-Id': payload.operationId, ...(input.csrfToken ? { 'X-CSRF-Token': input.csrfToken } : {}) }, body: JSON.stringify({ price: payload.price, ...(payload.message ? { message: payload.message } : {}) }), timeoutMs: 12000 });
      if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || 'لم يؤكد الخادم إرسال العرض.');
      await db.runAsync("DELETE FROM request_offer_outbox WHERE id=? AND owner_id=? AND state='processing'", head.id, input.ownerId); return 'synced' as const;
    } catch (error) {
      // Permanent server rejection — discard so the FIFO queue doesn't stall forever.
      if (error instanceof ApiError && error.status && [400, 404, 422].includes(error.status)) {
        await db.runAsync("DELETE FROM request_offer_outbox WHERE id=? AND owner_id=? AND state='processing'", head.id, input.ownerId);
        return 'discarded' as const;
      }
      const attempts = head.attempts + 1; const delay = Math.min(3600000, 5000 * 2 ** Math.min(attempts - 1, 10)); const message = (error instanceof Error ? error.message : 'تعذرت مزامنة العرض.').slice(0,500);
      await db.runAsync("UPDATE request_offer_outbox SET state='pending',attempts=?,last_error=?,next_attempt_at=?,lease_until=0 WHERE id=? AND owner_id=?", attempts, message, Date.now()+delay, head.id, input.ownerId);
      return error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'login-required' as const : 'retry-scheduled' as const;
    }
  })(); activeSyncByOwner.set(key, work); void work.finally(() => { if (activeSyncByOwner.get(key) === work) activeSyncByOwner.delete(key); }).catch(() => undefined); return work;
}
