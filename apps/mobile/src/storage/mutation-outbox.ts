/**
 * طابور عمليات الإعلانات دون اتصال (create / update / delete).
 * المنطق المشترك (lease, claim, retry) من `./outbox/core` — هذا الملف يبقي الواجهة العامة كما هي.
 */
import type * as SQLite from 'expo-sqlite';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import {
  OUTBOX_DATABASE_NAME,
  OUTBOX_DEFAULT_LEASE_MS,
  OUTBOX_ID_MAX_LENGTH,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_PAYLOAD_CHARS,
  OUTBOX_MAX_PENDING,
  acknowledgeItem,
  buildLeaseTableSql,
  claimItem,
  clearNonProcessing,
  ensureLeaseColumns,
  getOldestItem,
  listExhausted,
  listItems,
  listPendingDue,
  markItemFailed,
  recoverExpiredLeases,
  type LeaseOutboxItem,
} from '@/storage/outbox';

export type OutboxOperation = 'create-ad' | 'update-ad' | 'delete-ad';
export type OutboxState = 'pending' | 'processing' | 'failed';

export type OutboxItem = Omit<LeaseOutboxItem, 'operation'> & {
  operation: OutboxOperation;
};

const TABLE = 'mutation_outbox';
const OPERATIONS = ['create-ad', 'update-ad', 'delete-ad'] as const;

const CREDENTIAL_KEY =
  /^(?:access[_-]?token|refresh[_-]?token|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|api[_-]?key|csrf[_-]?token|session[_-]?token|jwt|bearer)$/i;

function containsCredentialField(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsCredentialField(item, seen));
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => CREDENTIAL_KEY.test(key) || containsCredentialField(child, seen),
  );
}

function asOutboxItem(item: LeaseOutboxItem): OutboxItem {
  return item as OutboxItem;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openEncryptedDatabaseAsync(OUTBOX_DATABASE_NAME);
      await db.execAsync(buildLeaseTableSql({ tableName: TABLE, operations: OPERATIONS }));
      await ensureLeaseColumns(db, TABLE);
      // استعادة leases منتهية عند فتح القاعدة (عامل توقّف فجأة)
      await recoverExpiredLeases(db, TABLE);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Store an explicit user-approved mutation for later processing. Never store auth tokens/cookies here. */
export async function enqueueMutation(input: {
  id: string;
  ownerId: string;
  operation: OutboxOperation;
  resourceId?: string | null;
  payload: unknown;
  idempotencyKey: string;
}): Promise<void> {
  if (!input.id.trim() || !input.idempotencyKey.trim()) {
    throw new Error('Outbox ID and idempotency key are required.');
  }
  if (typeof input.ownerId !== 'string' || !input.ownerId.trim() || input.ownerId.length > OUTBOX_ID_MAX_LENGTH) {
    throw new Error('A valid account owner is required for offline operations.');
  }
  if (input.id.length > OUTBOX_ID_MAX_LENGTH || input.idempotencyKey.length > OUTBOX_ID_MAX_LENGTH) {
    throw new Error('Outbox identifiers are too long.');
  }
  if (!OPERATIONS.includes(input.operation)) {
    throw new Error('Unsupported offline mutation operation.');
  }

  let payloadJson: string;
  try {
    payloadJson = JSON.stringify(input.payload);
  } catch {
    throw new Error('Offline mutation payload must be JSON-serializable.');
  }
  if (payloadJson.length > OUTBOX_MAX_PAYLOAD_CHARS) {
    throw new Error('Offline mutation payload exceeds the allowed size.');
  }
  if (containsCredentialField(input.payload)) {
    throw new Error('Authentication or credential fields are not allowed in offline mutation payloads.');
  }

  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    // فحص السعة + الإدراج في معاملة واحدة لمنع تجاوز MAX_PENDING عند تزامن
    const active =
      (
        await txn.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${TABLE} WHERE owner_id = ? AND state IN ('pending','failed','processing')`,
          input.ownerId,
        )
      )?.count ?? 0;
    if (active >= OUTBOX_MAX_PENDING) {
      throw new Error('Offline queue is full; reconnect and sync before adding more changes.');
    }
    await txn.runAsync(
      `INSERT INTO ${TABLE}
        (id, owner_id, operation, resource_id, payload_json, idempotency_key, state, attempts, created_at, last_error, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, 0)`,
      input.id,
      input.ownerId,
      input.operation,
      input.resourceId ?? null,
      payloadJson,
      input.idempotencyKey,
      Date.now(),
    );
  });
}

export async function listAllOutboxMutations(
  ownerId?: string | null,
  options?: { unlimited?: boolean },
): Promise<OutboxItem[]> {
  const db = await database();
  const items = await listItems(db, TABLE, ownerId, options);
  return items.map(asOutboxItem);
}

export async function countUnownedOutboxMutations(): Promise<number> {
  const db = await database();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${TABLE} WHERE owner_id IS NULL OR trim(owner_id) = ''`,
  );
  return row?.count ?? 0;
}

export async function discardOutboxMutation(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    `DELETE FROM ${TABLE} WHERE id = ? AND owner_id = ? AND state IN ('pending','failed')`,
    id,
    ownerId,
  );
  return result.changes === 1;
}

export async function listPendingMutations(ownerId?: string | null): Promise<OutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const items = await listPendingDue(db, TABLE, ownerId);
  return items.map(asOutboxItem);
}

export async function recoverExpiredOutboxLeases(now = Date.now()): Promise<number> {
  const db = await database();
  return recoverExpiredLeases(db, TABLE, now);
}

export async function getOldestOutboxMutation(ownerId?: string | null): Promise<OutboxItem | null> {
  const db = await database();
  const item = await getOldestItem(db, TABLE, ownerId);
  return item ? asOutboxItem(item) : null;
}

export async function listExhaustedMutations(ownerId?: string | null): Promise<OutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const items = await listExhausted(db, TABLE, ownerId);
  return items.map(asOutboxItem);
}

export async function retryExhaustedMutation(id: string, ownerId?: string | null): Promise<boolean> {
  if (!ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    `UPDATE ${TABLE} SET state = 'pending', attempts = 0, next_attempt_at = 0, last_error = NULL
     WHERE id = ? AND owner_id = ? AND state = 'failed' AND attempts >= ?
       AND NOT EXISTS (
         SELECT 1 FROM ${TABLE} older
         WHERE older.owner_id = ${TABLE}.owner_id AND (
           older.created_at < ${TABLE}.created_at
           OR (older.created_at = ${TABLE}.created_at AND older.id < ${TABLE}.id)
         )
       )`,
    id,
    ownerId,
    OUTBOX_MAX_ATTEMPTS,
  );
  return result.changes === 1;
}

export async function claimMutation(
  id: string,
  leaseOwner: string,
  leaseDurationMs = OUTBOX_DEFAULT_LEASE_MS,
  ownerId?: string | null,
): Promise<OutboxItem | null> {
  const db = await database();
  const item = await claimItem(db, TABLE, id, ownerId, leaseOwner, leaseDurationMs);
  return item ? asOutboxItem(item) : null;
}

export async function markMutationFailed(id: string, reason: string, leaseOwner: string): Promise<void> {
  const db = await database();
  await markItemFailed(db, TABLE, id, reason, leaseOwner);
}

export async function acknowledgeMutation(id: string, leaseOwner: string): Promise<boolean> {
  const db = await database();
  return acknowledgeItem(db, TABLE, id, leaseOwner);
}

export async function clearMutationOutbox(): Promise<void> {
  const db = await database();
  await clearNonProcessing(db, TABLE);
}
