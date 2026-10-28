import * as SQLite from 'expo-sqlite';
import { ApiError, apiRequest } from '@/api/client';

type OrderPayload = { items: { productId: string; quantity: number }[]; recipientName: string; recipientPhone: string; shippingCity: string; shippingAddress: string; buyerNote?: string; idempotencyKey: string };
export type PendingOrderOutboxItem = { id: string; ownerId: string; payload: OrderPayload; createdAt: number; attempts: number; lastError: string | null; nextAttemptAt: number; state: string };
type Row = { id: string; owner_id: string; payload_json: string; created_at: number; attempts: number; last_error: string | null; next_attempt_at: number; state: string; lease_until: number };
const DB_NAME = 'marketplat-public-cache.db'; const MAX_PENDING = 50; const MAX_ATTEMPTS = 8;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let activeSync: Promise<'synced' | 'nothing-due' | 'retry-scheduled' | 'login-required'> | null = null;
async function database() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async db => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS marketplace_order_outbox (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      next_attempt_at INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0
    ); CREATE INDEX IF NOT EXISTS marketplace_order_outbox_owner_created_idx ON marketplace_order_outbox(owner_id, created_at);`);
    await db.runAsync("UPDATE marketplace_order_outbox SET state='pending',lease_until=0,next_attempt_at=MAX(next_attempt_at,?) WHERE state='processing' AND lease_until<=?", Date.now()+5000, Date.now());
    return db;
  }).catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}
function validatePayload(value: unknown): asserts value is OrderPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('بيانات الطلب المحفوظ غير صالحة.');
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 50 || p.items.some((v) => !v || typeof v !== 'object' || typeof (v as any).productId !== 'string' || !(v as any).productId.trim() || !Number.isInteger((v as any).quantity) || (v as any).quantity < 1 || (v as any).quantity > 100) || typeof p.recipientName !== 'string' || p.recipientName.trim().length < 2 || p.recipientName.length > 160 || typeof p.recipientPhone !== 'string' || p.recipientPhone.trim().length < 6 || p.recipientPhone.length > 40 || typeof p.shippingCity !== 'string' || p.shippingCity.trim().length < 2 || p.shippingCity.length > 100 || typeof p.shippingAddress !== 'string' || p.shippingAddress.trim().length < 4 || p.shippingAddress.length > 500 || (p.buyerNote !== undefined && (typeof p.buyerNote !== 'string' || p.buyerNote.length > 1000)) || typeof p.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(p.idempotencyKey)) throw new Error('بيانات الطلب لا تطابق قواعد الحفظ دون اتصال.');
  if (new Set(p.items.map((v: any) => v.productId)).size !== p.items.length) throw new Error('ادمج الكميات المكررة للمنتج قبل حفظ الطلب.');
}
function mapRow(row: Row): PendingOrderOutboxItem {
  let payload: OrderPayload;
  try { const parsed: unknown = JSON.parse(row.payload_json); validatePayload(parsed); payload = parsed; }
  catch { payload = { items: [], recipientName: '', recipientPhone: '', shippingCity: '', shippingAddress: '', idempotencyKey: row.id }; }
  return { id: row.id, ownerId: row.owner_id, payload, createdAt: row.created_at, attempts: row.attempts, lastError: row.last_error, nextAttemptAt: row.next_attempt_at, state: row.state };
}
export async function enqueueMarketplaceOrder(ownerId: string, payload: OrderPayload): Promise<void> {
  if (!ownerId.trim() || ownerId.length > 160) throw new Error('تعذر تحديد الحساب المالك للطلب.');
  validatePayload(payload);
  const db = await database();
  await db.withExclusiveTransactionAsync(async tx => {
    const existing = await tx.getFirstAsync<{ id: string }>('SELECT id FROM marketplace_order_outbox WHERE owner_id=? AND id=?', ownerId, payload.idempotencyKey);
    if (existing) return; // repeated tap after ambiguous failure must not create a second local row
    const count = await tx.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM marketplace_order_outbox WHERE owner_id=? AND state IN ('pending','processing')", ownerId);
    if ((count?.count ?? 0) >= MAX_PENDING) throw new Error('طابور الطلبات دون اتصال ممتلئ؛ اتصل بالإنترنت للمزامنة أولًا.');
    await tx.runAsync("INSERT INTO marketplace_order_outbox (id,owner_id,payload_json,created_at,attempts,last_error,next_attempt_at,state,lease_until) VALUES (?,?,?, ?,0,NULL,0,'pending',0)", payload.idempotencyKey, ownerId, JSON.stringify(payload), Date.now());
  });
}
export async function listPendingMarketplaceOrders(ownerId?: string | null): Promise<PendingOrderOutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database(); const rows = await db.getAllAsync<Row>('SELECT * FROM marketplace_order_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT ?', ownerId, MAX_PENDING);
  return rows.map(mapRow);
}
export async function discardMarketplaceOrder(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database(); const result = await db.runAsync("DELETE FROM marketplace_order_outbox WHERE id=? AND owner_id=? AND state='pending'", id, ownerId); return result.changes === 1;
}
/** Called by the sync worker when the server permanently rejects an order
 *  (400/404/422). Deletes immediately so the FIFO queue doesn't stall forever. */
export async function discardRejectedMarketplaceOrder(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync("DELETE FROM marketplace_order_outbox WHERE id=? AND owner_id=? AND state='processing'", id, ownerId);
  return result.changes === 1;
}

export async function retryMarketplaceOrder(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database(); const result = await db.runAsync("UPDATE marketplace_order_outbox SET attempts=0,last_error=NULL,next_attempt_at=0,state='pending',lease_until=0 WHERE id=? AND owner_id=? AND state='pending' AND attempts>=?", id, ownerId, MAX_ATTEMPTS); return result.changes === 1;
}
export async function syncNextMarketplaceOrder(input: { isOnline: boolean; token?: string | null; ownerId?: string | null; csrfToken?: string | null }): Promise<'synced' | 'discarded' | 'nothing-due' | 'retry-scheduled' | 'login-required'> {
  if (activeSync) return activeSync;
  const work = (async () => {
    if (!input.isOnline) return 'nothing-due' as const;
    if (!input.token?.trim() || !input.ownerId?.trim()) return 'login-required' as const;
    const db = await database(); const now = Date.now();
    await db.runAsync("UPDATE marketplace_order_outbox SET state='pending',lease_until=0,next_attempt_at=MAX(next_attempt_at,?) WHERE state='processing' AND lease_until<=?", now + 5000, now);
    const head = await db.getFirstAsync<Row>('SELECT * FROM marketplace_order_outbox WHERE owner_id=? ORDER BY created_at ASC LIMIT 1', input.ownerId);
    if (!head || head.next_attempt_at > now || head.attempts >= MAX_ATTEMPTS || head.state === 'processing') return 'nothing-due' as const;
    const lease = now + 30_000;
    const claimed = await db.runAsync("UPDATE marketplace_order_outbox SET state='processing',lease_until=? WHERE id=? AND owner_id=? AND state='pending' AND next_attempt_at<=?", lease, head.id, input.ownerId, now);
    if (claimed.changes !== 1) return 'nothing-due' as const;
    try {
      const payload: unknown = JSON.parse(head.payload_json); validatePayload(payload);
      const response = await apiRequest<{ success: boolean; message?: string; data?: unknown }>('/api/v1/orders', { method: 'POST', token: input.token, headers: { 'X-Offline-Op-Id': payload.idempotencyKey, ...(input.csrfToken ? { 'X-CSRF-Token': input.csrfToken } : {}) }, body: JSON.stringify(payload), timeoutMs: 12_000 });
      if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || 'لم يؤكد الخادم إنشاء الطلب.');
      await db.runAsync("DELETE FROM marketplace_order_outbox WHERE id=? AND owner_id=? AND state='processing'", head.id, input.ownerId);
      return 'synced' as const;
    } catch (error) {
      // Permanent server rejection — discard so the FIFO queue doesn't stall forever.
      if (error instanceof ApiError && error.status && [400, 404, 422].includes(error.status)) {
        await db.runAsync("DELETE FROM marketplace_order_outbox WHERE id=? AND owner_id=? AND state='processing'", head.id, input.ownerId);
        return 'discarded' as const;
      }
      const attempts = head.attempts + 1; const delay = Math.min(60 * 60_000, 5000 * 2 ** Math.min(attempts - 1, 10));
      const message = (error instanceof Error ? error.message : 'تعذرت مزامنة الطلب.').slice(0, 500);
      await db.runAsync("UPDATE marketplace_order_outbox SET state='pending',attempts=?,last_error=?,next_attempt_at=?,lease_until=0 WHERE id=? AND owner_id=?", attempts, message, Date.now()+delay, head.id, input.ownerId);
      return error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'login-required' as const : 'retry-scheduled' as const;
    }
  })();
  activeSync = work; void work.finally(() => { if (activeSync === work) activeSync = null; }).catch(() => undefined); return work;
}
