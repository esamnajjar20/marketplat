/**
 * طابور رسائل الدردشة دون اتصال.
 * يستخدم ثوابت النواة الموحّدة من `@/storage/outbox`.
 */
import * as SQLite from 'expo-sqlite';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import {
  OUTBOX_DATABASE_NAME,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_PENDING,
  OUTBOX_OP_ID_PATTERN,
  computeRetryDelayMs,
} from '@/storage/outbox';

const MAX_BODY_LENGTH = 2_000;
export const CHAT_OUTBOX_MAX_ATTEMPTS = OUTBOX_MAX_ATTEMPTS;

export type ChatMessageOutboxItem = {
  id: string;
  ownerId: string;
  conversationId: string;
  body: string;
  operationId: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
};

type ChatMessageOutboxRow = {
  id: string;
  owner_id: string;
  conversation_id: string;
  body: string;
  operation_id: string;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openEncryptedDatabaseAsync(OUTBOX_DATABASE_NAME)
      .then(async (db) => {
        await db.execAsync(`
        CREATE TABLE IF NOT EXISTS chat_message_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          body TEXT NOT NULL,
          operation_id TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS chat_message_outbox_owner_created_idx
          ON chat_message_outbox(owner_id, created_at);
        CREATE INDEX IF NOT EXISTS chat_message_outbox_due_idx
          ON chat_message_outbox(owner_id, next_attempt_at, created_at);
      `);
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

function mapRow(row: ChatMessageOutboxRow): ChatMessageOutboxItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    conversationId: row.conversation_id,
    body: row.body,
    operationId: row.operation_id,
    createdAt: row.created_at,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
  };
}

export async function enqueueChatMessage(input: {
  ownerId: string;
  conversationId: string;
  body: string;
  operationId: string;
}): Promise<ChatMessageOutboxItem> {
  const body = input.body.trim();
  if (!input.ownerId.trim() || !input.conversationId.trim()) {
    throw new Error('يجب تحديد الحساب والمحادثة قبل حفظ الرسالة.');
  }
  if (!body || body.length > MAX_BODY_LENGTH) {
    throw new Error('نص الرسالة فارغ أو يتجاوز الحد المسموح.');
  }
  if (!OUTBOX_OP_ID_PATTERN.test(input.operationId)) {
    throw new Error('معرّف عملية الرسالة غير صالح.');
  }
  const db = await database();
  const createdAt = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<ChatMessageOutboxRow>(
      'SELECT * FROM chat_message_outbox WHERE operation_id = ?',
      input.operationId,
    );
    if (existing) {
      if (
        existing.owner_id !== input.ownerId ||
        existing.conversation_id !== input.conversationId ||
        existing.body !== body
      ) {
        throw new Error('معرّف العملية مستخدم لرسالة مختلفة؛ لم تُستبدل الرسالة المحفوظة.');
      }
      return;
    }
    const count = await txn.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM chat_message_outbox WHERE owner_id = ?',
      input.ownerId,
    );
    if ((count?.count ?? 0) >= OUTBOX_MAX_PENDING) {
      throw new Error('طابور الرسائل دون اتصال ممتلئ. اتصل بالإنترنت لمزامنة الرسائل أولًا.');
    }
    await txn.runAsync(
      `INSERT INTO chat_message_outbox (id, owner_id, conversation_id, body, operation_id, created_at, attempts, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL)`,
      `chat-outbox:${input.operationId}`,
      input.ownerId,
      input.conversationId,
      body,
      input.operationId,
      createdAt,
    );
  });
  const row = await db.getFirstAsync<ChatMessageOutboxRow>(
    'SELECT * FROM chat_message_outbox WHERE operation_id = ?',
    input.operationId,
  );
  if (!row) throw new Error('تعذر التحقق من حفظ الرسالة محليًا.');
  return mapRow(row);
}

export async function listChatMessagesForConversation(
  ownerId: string,
  conversationId: string,
): Promise<ChatMessageOutboxItem[]> {
  if (!ownerId.trim() || !conversationId.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<ChatMessageOutboxRow>(
    'SELECT * FROM chat_message_outbox WHERE owner_id = ? AND conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT ?',
    ownerId,
    conversationId,
    OUTBOX_MAX_PENDING,
  );
  return rows.map(mapRow);
}

export async function listChatMessagesForOwner(ownerId: string): Promise<ChatMessageOutboxItem[]> {
  if (!ownerId.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<ChatMessageOutboxRow>(
    'SELECT * FROM chat_message_outbox WHERE owner_id = ? ORDER BY created_at ASC, id ASC LIMIT ?',
    ownerId,
    OUTBOX_MAX_PENDING,
  );
  return rows.map(mapRow);
}

export async function listDueChatMessages(ownerId: string, now: number = Date.now()): Promise<ChatMessageOutboxItem[]> {
  if (!ownerId.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<ChatMessageOutboxRow>(
    `SELECT * FROM chat_message_outbox
     WHERE owner_id = ? AND next_attempt_at <= ? AND attempts < ?
     ORDER BY created_at ASC, id ASC LIMIT ?`,
    ownerId,
    now,
    OUTBOX_MAX_ATTEMPTS,
    OUTBOX_MAX_PENDING,
  );
  return rows.map(mapRow);
}

export async function acknowledgeChatMessage(operationId: string, ownerId: string): Promise<boolean> {
  if (!operationId.trim() || !ownerId.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    'DELETE FROM chat_message_outbox WHERE operation_id = ? AND owner_id = ?',
    operationId,
    ownerId,
  );
  return result.changes === 1;
}

export async function deferChatMessage(
  operationId: string,
  ownerId: string,
  error: unknown,
): Promise<void> {
  const db = await database();
  const row = await db.getFirstAsync<{ attempts: number }>(
    'SELECT attempts FROM chat_message_outbox WHERE operation_id = ? AND owner_id = ?',
    operationId,
    ownerId,
  );
  if (!row) return;
  const attempts = row.attempts + 1;
  const delay = computeRetryDelayMs(attempts);
  const message = (error instanceof Error ? error.message : 'تعذرت مزامنة الرسالة.').slice(0, 400);
  await db.runAsync(
    `UPDATE chat_message_outbox
     SET attempts = ?, next_attempt_at = ?, last_error = ?
     WHERE operation_id = ? AND owner_id = ?`,
    attempts,
    Date.now() + delay,
    message,
    operationId,
    ownerId,
  );
}

export async function discardChatMessage(operationId: string, ownerId: string): Promise<boolean> {
  return acknowledgeChatMessage(operationId, ownerId);
}

export async function countPendingChatMessages(ownerId?: string | null): Promise<number> {
  if (!ownerId?.trim()) return 0;
  const db = await database();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM chat_message_outbox WHERE owner_id = ?',
    ownerId,
  );
  return row?.count ?? 0;
}


/** User-initiated retry: resets attempts to 0 and clears backoff. */
export async function retryChatMessage(operationId: string, ownerId: string): Promise<boolean> {
  if (!operationId.trim() || !ownerId.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    `UPDATE chat_message_outbox
     SET attempts = 0, next_attempt_at = 0, last_error = NULL
     WHERE operation_id = ? AND owner_id = ? AND attempts >= ?`,
    operationId, ownerId, OUTBOX_MAX_ATTEMPTS,
  );
  return result.changes === 1;
}

/** User-confirmed discard of a failed (exhausted) message. */
export async function discardFailedChatMessage(operationId: string, ownerId: string): Promise<boolean> {
  if (!operationId.trim() || !ownerId.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    `DELETE FROM chat_message_outbox
     WHERE operation_id = ? AND owner_id = ? AND attempts >= ?`,
    operationId, ownerId, OUTBOX_MAX_ATTEMPTS,
  );
  return result.changes === 1;
}

/** Called by sync worker when server permanently rejects a message. */
export async function discardRejectedChatMessage(operationId: string, ownerId: string): Promise<boolean> {
  return acknowledgeChatMessage(operationId, ownerId);
}
