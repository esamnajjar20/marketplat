/**
 * نواة مشتركة لطوابير الـ Outbox ذات الـ lease.
 *
 * توفّر:
 * - إنشاء الجدول + الفهارس + ترقية الأعمدة الناقصة
 * - استعادة leases المنتهية
 * - claim / acknowledge / markFailed
 * - قراءة الرأس (FIFO) والعدّ
 *
 * كل طابور محدد (mutation, …) يمرّر اسم الجدول وقائمة العمليات المسموحة.
 */
import type * as SQLite from 'expo-sqlite';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_PENDING,
  OUTBOX_RETRY_BASE_DELAY_MS,
  computeRetryDelayMs,
} from './constants';
import { mapLeaseRow, type LeaseOutboxItem, type LeaseOutboxRow, type OutboxState } from './types';

export type LeaseTableConfig = {
  /** اسم الجدول في SQLite */
  tableName: string;
  /** قيم operation المسموحة لـ CHECK */
  operations: readonly string[];
};

/** يبني SQL إنشاء جدول lease-based موحّد */
export function buildLeaseTableSql(config: LeaseTableConfig): string {
  const ops = config.operations.map((o) => `'${o.replace(/'/g, "''")}'`).join(',');
  const t = config.tableName;
  return `
    CREATE TABLE IF NOT EXISTS ${t} (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      operation TEXT NOT NULL CHECK(operation IN (${ops})),
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
    CREATE INDEX IF NOT EXISTS ${t}_state_created_idx ON ${t}(state, created_at);
    CREATE INDEX IF NOT EXISTS ${t}_owner_created_idx ON ${t}(owner_id, created_at);
  `;
}

/**
 * يضيف أعمدة lease إن كانت قاعدة قديمة بلاها.
 * آمن للاستدعاء المتكرر.
 */
export async function ensureLeaseColumns(
  db: SQLite.SQLiteDatabase,
  tableName: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const names = new Set(columns.map((c) => c.name));
  if (!names.has('lease_owner')) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN lease_owner TEXT`);
  }
  if (!names.has('lease_until')) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('next_attempt_at')) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0`);
  }
}

/** استعادة الصفوف العالقة في processing بعد انتهاء الـ lease */
export async function recoverExpiredLeases(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  now = Date.now(),
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE ${tableName}
     SET state = 'pending', lease_owner = NULL, lease_until = 0,
         next_attempt_at = MAX(next_attempt_at, ?)
     WHERE state = 'processing' AND lease_until <= ?`,
    now + OUTBOX_RETRY_BASE_DELAY_MS,
    now,
  );
  return result.changes;
}

/** رأس الطابور (FIFO) لحساب معيّن */
export async function getOldestItem(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  ownerId?: string | null,
): Promise<LeaseOutboxItem | null> {
  const row = ownerId?.trim()
    ? await db.getFirstAsync<LeaseOutboxRow>(
        `SELECT * FROM ${tableName} WHERE owner_id = ? ORDER BY created_at ASC, id ASC LIMIT 1`,
        ownerId,
      )
    : await db.getFirstAsync<LeaseOutboxRow>(
        `SELECT * FROM ${tableName} ORDER BY created_at ASC, id ASC LIMIT 1`,
      );
  return row ? mapLeaseRow(row) : null;
}

/**
 * يدّعي صفًا للمعالجة. يعيد العنصر إن نجح الادعاء، وإلا null.
 * يشترط ownerId غير فارغ.
 */
export async function claimItem(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  id: string,
  ownerId: string | null | undefined,
  leaseOwner: string,
  leaseDurationMs: number,
): Promise<LeaseOutboxItem | null> {
  if (!leaseOwner.trim() || leaseOwner.length > 160) {
    throw new Error('A valid outbox lease owner is required.');
  }
  if (!ownerId?.trim()) return null;

  const now = Date.now();
  const result = await db.runAsync(
    `UPDATE ${tableName}
     SET state = 'processing', attempts = attempts + 1, last_error = NULL,
         lease_owner = ?, lease_until = ?
     WHERE id = ? AND owner_id = ?
       AND (state IN ('pending','failed') OR (state = 'processing' AND lease_until <= ?))
       AND next_attempt_at <= ?
       AND attempts < ?`,
    leaseOwner,
    now + Math.max(1_000, leaseDurationMs),
    id,
    ownerId,
    now,
    now,
    OUTBOX_MAX_ATTEMPTS,
  );
  if (result.changes !== 1) return null;

  const row = await db.getFirstAsync<LeaseOutboxRow>(
    `SELECT * FROM ${tableName}
     WHERE id = ? AND state = 'processing' AND lease_owner = ?`,
    id,
    leaseOwner,
  );
  return row ? mapLeaseRow(row) : null;
}

/** يحذف الصف بعد نجاح الإرسال على الخادم (فقط لمالك الـ lease) */
export async function acknowledgeItem(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  id: string,
  leaseOwner: string,
): Promise<boolean> {
  const result = await db.runAsync(
    `DELETE FROM ${tableName}
     WHERE id = ? AND state = 'processing' AND lease_owner = ?`,
    id,
    leaseOwner,
  );
  return result.changes === 1;
}

/** يعلّم الصف كفاشل مع backoff أسّي */
export async function markItemFailed(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  id: string,
  reason: string,
  leaseOwner: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ attempts: number }>(
    `SELECT attempts FROM ${tableName}
     WHERE id = ? AND state = 'processing' AND lease_owner = ?`,
    id,
    leaseOwner,
  );
  if (!row) return;

  const delay = computeRetryDelayMs(row.attempts);
  await db.runAsync(
    `UPDATE ${tableName}
     SET state = 'failed', last_error = ?, next_attempt_at = ?,
         lease_owner = NULL, lease_until = 0
     WHERE id = ? AND state = 'processing' AND lease_owner = ?`,
    reason.slice(0, 500),
    Date.now() + delay,
    id,
    leaseOwner,
  );
}

/** عدد الصفوف النشطة لحساب (لسقف MAX_PENDING) */
export async function countActiveItems(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  ownerId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${tableName}
     WHERE owner_id = ? AND state IN ('pending','failed','processing')`,
    ownerId,
  );
  return row?.count ?? 0;
}

export async function listItems(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  ownerId?: string | null,
  options?: { unlimited?: boolean; state?: OutboxState },
): Promise<LeaseOutboxItem[]> {
  const limit = options?.unlimited ? null : OUTBOX_MAX_PENDING;
  const stateClause = options?.state ? ` AND state = '${options.state}'` : '';

  let rows: LeaseOutboxRow[];
  if (ownerId?.trim()) {
    rows = limit
      ? await db.getAllAsync<LeaseOutboxRow>(
          `SELECT * FROM ${tableName} WHERE owner_id = ?${stateClause} ORDER BY created_at ASC, id ASC LIMIT ?`,
          ownerId,
          limit,
        )
      : await db.getAllAsync<LeaseOutboxRow>(
          `SELECT * FROM ${tableName} WHERE owner_id = ?${stateClause} ORDER BY created_at ASC, id ASC`,
          ownerId,
        );
  } else {
    rows = limit
      ? await db.getAllAsync<LeaseOutboxRow>(
          `SELECT * FROM ${tableName} WHERE 1=1${stateClause} ORDER BY created_at ASC, id ASC LIMIT ?`,
          limit,
        )
      : await db.getAllAsync<LeaseOutboxRow>(
          `SELECT * FROM ${tableName} WHERE 1=1${stateClause} ORDER BY created_at ASC, id ASC`,
        );
  }
  return rows.map(mapLeaseRow);
}

export async function listPendingDue(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  ownerId: string,
): Promise<LeaseOutboxItem[]> {
  const rows = await db.getAllAsync<LeaseOutboxRow>(
    `SELECT * FROM ${tableName}
     WHERE owner_id = ?
       AND state IN ('pending','failed')
       AND next_attempt_at <= ?
       AND attempts < ?
     ORDER BY created_at ASC LIMIT ?`,
    ownerId,
    Date.now(),
    OUTBOX_MAX_ATTEMPTS,
    OUTBOX_MAX_PENDING,
  );
  return rows.map(mapLeaseRow);
}

export async function listExhausted(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  ownerId: string,
): Promise<LeaseOutboxItem[]> {
  const rows = await db.getAllAsync<LeaseOutboxRow>(
    `SELECT * FROM ${tableName}
     WHERE owner_id = ? AND state = 'failed' AND attempts >= ?
     ORDER BY created_at ASC, id ASC LIMIT ?`,
    ownerId,
    OUTBOX_MAX_ATTEMPTS,
    OUTBOX_MAX_PENDING,
  );
  return rows.map(mapLeaseRow);
}

/** مسح كل شيء عدا الصفوف قيد المعالجة */
export async function clearNonProcessing(
  db: SQLite.SQLiteDatabase,
  tableName: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM ${tableName} WHERE state != 'processing'`);
}
