import * as SQLite from 'expo-sqlite';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_PENDING = 50;
const MAX_PAYLOAD_CHARS = 100_000;
const MAX_ATTEMPTS = 8;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 60 * 60 * 1_000;

export type OutboxOperation = 'create-ad' | 'update-ad' | 'delete-ad';
export type OutboxState = 'pending' | 'processing' | 'failed';
export type OutboxItem = {
  id: string;
  ownerId: string | null;
  operation: OutboxOperation;
  resourceId: string | null;
  payloadJson: string;
  idempotencyKey: string;
  state: OutboxState;
  attempts: number;
  createdAt: number;
  lastError: string | null;
  nextAttemptAt: number;
  leaseOwner: string | null;
  leaseUntil: number;
};

type OutboxRow = {
  id: string;
  owner_id: string | null;
  operation: OutboxOperation;
  resource_id: string | null;
  payload_json: string;
  idempotency_key: string;
  state: OutboxState;
  attempts: number;
  created_at: number;
  last_error: string | null;
  next_attempt_at: number;
  lease_owner: string | null;
  lease_until: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openEncryptedDatabaseAsync(DATABASE_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS mutation_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT,
          operation TEXT NOT NULL CHECK(operation IN ('create-ad','update-ad','delete-ad')),
          resource_id TEXT,
          payload_json TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL CHECK(state IN ('pending','processing','failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          last_error TEXT,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,
          lease_owner TEXT,
          lease_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS mutation_outbox_state_created_idx
          ON mutation_outbox(state, created_at);
        CREATE INDEX IF NOT EXISTS mutation_outbox_owner_created_idx
          ON mutation_outbox(owner_id, created_at);
      `);
      // Upgrade databases created by older app versions without dropping queued work.
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(mutation_outbox)');
      if (!columns.some((column) => column.name === 'owner_id')) {
        // Old queued rows have no trustworthy account association. Keep them for recovery
        // but never send them automatically under whichever account signs in next.
        await db.execAsync('ALTER TABLE mutation_outbox ADD COLUMN owner_id TEXT');
      }
      if (!columns.some((column) => column.name === 'next_attempt_at')) {
        await db.execAsync('ALTER TABLE mutation_outbox ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0');
      }
      if (!columns.some((column) => column.name === 'lease_owner')) {
        await db.execAsync('ALTER TABLE mutation_outbox ADD COLUMN lease_owner TEXT');
      }
      if (!columns.some((column) => column.name === 'lease_until')) {
        await db.execAsync('ALTER TABLE mutation_outbox ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0');
      }
      // Recover only expired processing leases. A still-valid lease belongs to a worker
      // that may be waiting for a server response and must not be stolen on DB reuse.
      await db.runAsync("UPDATE mutation_outbox SET state = 'pending', lease_owner = NULL, lease_until = 0, next_attempt_at = MAX(next_attempt_at, ?) WHERE state = 'processing' AND lease_until <= ?", Date.now() + RETRY_BASE_DELAY_MS, Date.now());
      return db;
    })().catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|api[_-]?key|csrf[_-]?token|session[_-]?token|jwt|bearer)$/i;

function containsCredentialField(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false; // JSON.stringify below rejects cycles separately.
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsCredentialField(item, seen));
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => CREDENTIAL_KEY.test(key) || containsCredentialField(child, seen),
  );
}

function mapRow(row: OutboxRow): OutboxItem {
  return {
    id: row.id, ownerId: row.owner_id, operation: row.operation, resourceId: row.resource_id,
    payloadJson: row.payload_json, idempotencyKey: row.idempotency_key,
    state: row.state, attempts: row.attempts, createdAt: row.created_at,
    lastError: row.last_error, nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner, leaseUntil: row.lease_until,
  };
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
  if (!input.id.trim() || !input.idempotencyKey.trim()) throw new Error('Outbox ID and idempotency key are required.');
  if (typeof input.ownerId !== 'string' || !input.ownerId.trim() || input.ownerId.length > 160) throw new Error('A valid account owner is required for offline operations.');
  if (input.id.length > 160 || input.idempotencyKey.length > 160) throw new Error('Outbox identifiers are too long.');
  if (!['create-ad', 'update-ad', 'delete-ad'].includes(input.operation)) {
    throw new Error('Unsupported offline mutation operation.');
  }
  let payloadJson: string | undefined;
  try { payloadJson = JSON.stringify(input.payload); } catch {
    throw new Error('Offline mutation payload must be JSON-serializable.');
  }
  if (typeof payloadJson !== 'string') throw new Error('Offline mutation payload must be JSON-serializable.');
  if (payloadJson.length > MAX_PAYLOAD_CHARS) throw new Error('Offline mutation payload exceeds the allowed size.');
  // Inspect object keys, not the serialized text: ordinary ad copy may legitimately
  // contain words such as “password” without containing a credential field.
  if (containsCredentialField(input.payload)) {
    throw new Error('Authentication or credential fields are not allowed in offline mutation payloads.');
  }
  const db = await database();
  // Keep capacity-check + insert in one exclusive transaction. Without this, two
  // simultaneous enqueue calls can both observe 49 rows and exceed MAX_PENDING.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const count = await txn.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM mutation_outbox WHERE owner_id = ? AND state IN ('pending','failed','processing')", input.ownerId,
    );
    if ((count?.count ?? 0) >= MAX_PENDING) {
      throw new Error('Offline queue is full; reconnect and sync before adding more changes.');
    }
    await txn.runAsync(
      `INSERT INTO mutation_outbox (id, owner_id, operation, resource_id, payload_json, idempotency_key, state, attempts, created_at, last_error, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, 0)`,
      input.id, input.ownerId, input.operation, input.resourceId ?? null, payloadJson, input.idempotencyKey, Date.now(),
    );
  });
}

/** List every retained operation for a queue-management screen, including blocked and exhausted work. */
export async function listAllOutboxMutations(
  ownerId?: string | null,
  options?: { unlimited?: boolean },
): Promise<OutboxItem[]> {
  const db = await database();
  // unlimited: true bypasses MAX_PENDING for reference checks (e.g. image cleanup).
  // Normal queue-management reads keep the cap for bounded memory.
  const rows = ownerId?.trim()
    ? options?.unlimited
      ? await db.getAllAsync<OutboxRow>('SELECT * FROM mutation_outbox WHERE owner_id = ? ORDER BY created_at ASC, id ASC', ownerId)
      : await db.getAllAsync<OutboxRow>('SELECT * FROM mutation_outbox WHERE owner_id = ? ORDER BY created_at ASC, id ASC LIMIT ?', ownerId, MAX_PENDING)
    : options?.unlimited
      ? await db.getAllAsync<OutboxRow>('SELECT * FROM mutation_outbox ORDER BY created_at ASC, id ASC')
      : await db.getAllAsync<OutboxRow>('SELECT * FROM mutation_outbox ORDER BY created_at ASC, id ASC LIMIT ?', MAX_PENDING);
  return rows.map(mapRow);
}


/** Count pre-migration queue rows whose account cannot be verified; these are never auto-synced. */
export async function countUnownedOutboxMutations(): Promise<number> {
  const db = await database();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM mutation_outbox WHERE owner_id IS NULL OR trim(owner_id) = ''",
  );
  return row?.count ?? 0;
}

/** Explicit user-requested discard. Never remove a row while a worker is processing it. */
export async function discardOutboxMutation(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    "DELETE FROM mutation_outbox WHERE id = ? AND owner_id = ? AND state IN ('pending','failed')", id, ownerId,
  );
  return result.changes === 1;
}

export async function listPendingMutations(ownerId?: string | null): Promise<OutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT * FROM mutation_outbox WHERE owner_id = ? AND state IN ('pending','failed') AND next_attempt_at <= ? AND attempts < ? ORDER BY created_at ASC LIMIT ?", ownerId, Date.now(), MAX_ATTEMPTS, MAX_PENDING,
  );
  return rows.map(mapRow);
}

/** Recover only expired processing leases; ownership checks make stale workers harmless. */
export async function recoverExpiredOutboxLeases(now = Date.now()): Promise<number> {
  const db = await database();
  const result = await db.runAsync(
    "UPDATE mutation_outbox SET state = 'pending', lease_owner = NULL, lease_until = 0, next_attempt_at = MAX(next_attempt_at, ?) WHERE state = 'processing' AND lease_until <= ?",
    now + RETRY_BASE_DELAY_MS, now,
  );
  return result.changes;
}

/** Read the true FIFO head, including backoff/exhausted/processing rows, so newer work cannot leapfrog it. */
export async function getOldestOutboxMutation(ownerId?: string | null): Promise<OutboxItem | null> {
  const db = await database();
  // No owner means diagnostic-only lookup. Sync callers must provide an account ID.
  const row = ownerId?.trim()
    ? await db.getFirstAsync<OutboxRow>('SELECT * FROM mutation_outbox WHERE owner_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', ownerId)
    : await db.getFirstAsync<OutboxRow>('SELECT * FROM mutation_outbox ORDER BY created_at ASC, id ASC LIMIT 1');
  return row ? mapRow(row) : null;
}

/** Claim one item before sending; server must enforce the same Idempotency-Key for safe retries. */
/** Return exhausted failures for a UI to explain and let the user decide what to do. */
export async function listExhaustedMutations(ownerId?: string | null): Promise<OutboxItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT * FROM mutation_outbox WHERE owner_id = ? AND state = 'failed' AND attempts >= ? ORDER BY created_at ASC, id ASC LIMIT ?",
    ownerId, MAX_ATTEMPTS, MAX_PENDING,
  );
  return rows.map(mapRow);
}

/** Explicit user retry. Keep the same idempotency key so server-side deduplication remains possible. */
export async function retryExhaustedMutation(id: string, ownerId?: string | null): Promise<boolean> {
  if (!ownerId?.trim()) return false;
  const db = await database();
  // Only retry the FIFO head within this account's queue.
  const result = await db.runAsync(
    `UPDATE mutation_outbox SET state = 'pending', attempts = 0, next_attempt_at = 0, last_error = NULL
     WHERE id = ? AND owner_id = ? AND state = 'failed' AND attempts >= ?
       AND NOT EXISTS (
         SELECT 1 FROM mutation_outbox older
         WHERE older.owner_id = mutation_outbox.owner_id AND (
           older.created_at < mutation_outbox.created_at
           OR (older.created_at = mutation_outbox.created_at AND older.id < mutation_outbox.id)
         )
       )`,
    id, ownerId, MAX_ATTEMPTS,
  );
  return result.changes === 1;
}

export async function claimMutation(id: string, leaseOwner: string, leaseDurationMs = 60_000, ownerId?: string | null): Promise<OutboxItem | null> {
  const db = await database();
  // A failed item may be retried, but the conditional UPDATE ensures only one worker
  // can claim a row at a time. Never return a row unless this call actually claimed it.
  if (!leaseOwner.trim() || leaseOwner.length > 160) throw new Error('A valid outbox lease owner is required.');
  const now = Date.now();
  const result = ownerId?.trim()
    ? await db.runAsync("UPDATE mutation_outbox SET state = 'processing', attempts = attempts + 1, last_error = NULL, lease_owner = ?, lease_until = ? WHERE id = ? AND owner_id = ? AND (state IN ('pending','failed') OR (state = 'processing' AND lease_until <= ?)) AND next_attempt_at <= ? AND attempts < ?", leaseOwner, now + Math.max(1_000, leaseDurationMs), id, ownerId, now, now, MAX_ATTEMPTS)
    : { changes: 0 };
  if (result.changes !== 1) return null;
  const row = await db.getFirstAsync<OutboxRow>("SELECT * FROM mutation_outbox WHERE id = ? AND state = 'processing' AND lease_owner = ?", id, leaseOwner);
  return row ? mapRow(row) : null;
}

export async function markMutationFailed(id: string, reason: string, leaseOwner: string): Promise<void> {
  const db = await database();
  // Only the worker currently owning the item can move it to failed.
  const row = await db.getFirstAsync<{ attempts: number }>("SELECT attempts FROM mutation_outbox WHERE id = ? AND state = 'processing' AND lease_owner = ?", id, leaseOwner);
  if (!row) return;
  // Exponential backoff capped at one hour; rows beyond the retry budget stay visible
  // for diagnostics but are no longer returned by listPendingMutations().
  const delay = Math.min(RETRY_BASE_DELAY_MS * (2 ** Math.max(0, row.attempts - 1)), RETRY_MAX_DELAY_MS);
  await db.runAsync("UPDATE mutation_outbox SET state = 'failed', last_error = ?, next_attempt_at = ?, lease_owner = NULL, lease_until = 0 WHERE id = ? AND state = 'processing' AND lease_owner = ?", reason.slice(0, 500), Date.now() + delay, id, leaseOwner);
}

export async function acknowledgeMutation(id: string, leaseOwner: string): Promise<boolean> {
  const db = await database();
  // Acknowledgement is valid only for an item currently owned by a worker.
  // If the server succeeded but the app crashed before this call, retry with the same
  // idempotency key; the server must return the original result for that key.
  const result = await db.runAsync("DELETE FROM mutation_outbox WHERE id = ? AND state = 'processing' AND lease_owner = ?", id, leaseOwner);
  return result.changes === 1;
}

export async function clearMutationOutbox(): Promise<void> {
  const db = await database();
  // Never erase in-flight work: the server may already have committed it.
  await db.runAsync("DELETE FROM mutation_outbox WHERE state != 'processing'");
}
