import * as SQLite from 'expo-sqlite';
import type { ChatMessage } from '@/features/messaging/messaging.api';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_MESSAGES_PER_CONVERSATION = 300;
const MAX_MESSAGES_PER_OWNER = 2_000;
const MAX_MESSAGE_JSON_CHARS = 32_000;

type CachedMessageRow = {
  message_id: string;
  value_json: string;
  created_at: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async db => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS chat_message_cache (
          owner_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          value_json TEXT NOT NULL,
          PRIMARY KEY (owner_id, conversation_id, message_id)
        );
        CREATE INDEX IF NOT EXISTS chat_message_cache_thread_idx
          ON chat_message_cache(owner_id, conversation_id, created_at DESC, message_id DESC);
        CREATE INDEX IF NOT EXISTS chat_message_cache_owner_idx
          ON chat_message_cache(owner_id, created_at DESC);
      `);
      return db;
    }).catch(error => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function validMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return typeof message.id === 'string' && message.id.length > 0 &&
    typeof message.senderId === 'string' && typeof message.createdAt === 'string' &&
    Number.isFinite(Date.parse(message.createdAt));
}

/** Read only the current account's cached messages for one visited conversation. */
export async function readCachedChatMessages(ownerId: string, conversationId: string): Promise<ChatMessage[]> {
  if (!ownerId.trim() || !conversationId.trim()) return [];
  try {
    const db = await database();
    const rows = await db.getAllAsync<CachedMessageRow>(
      `SELECT message_id, value_json, created_at FROM chat_message_cache
       WHERE owner_id = ? AND conversation_id = ?
       ORDER BY created_at DESC, message_id DESC LIMIT ?`,
      ownerId, conversationId, MAX_MESSAGES_PER_CONVERSATION,
    );
    return rows.map(row => {
      if (row.value_json.length > MAX_MESSAGE_JSON_CHARS) return null;
      try {
        const parsed: unknown = JSON.parse(row.value_json);
        return validMessage(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }).filter((message): message is ChatMessage => message !== null).reverse();
  } catch {
    // Cache is best-effort; SQLite failures must never block the online API.
    return [];
  }
}

/** Upsert authoritative server messages and keep the local history bounded per account. */
export async function saveCachedChatMessages(
  ownerId: string,
  conversationId: string,
  messages: ChatMessage[],
): Promise<void> {
  if (!ownerId.trim() || !conversationId.trim() || !Array.isArray(messages) || !messages.length) return;
  const safeRows = messages.filter(message => validMessage(message) &&
    (!message.conversationId || message.conversationId === conversationId))
    .map(message => ({
      message,
      json: JSON.stringify({ ...message, conversationId }),
      createdAt: Date.parse(message.createdAt),
    }))
    .filter(row => row.json.length <= MAX_MESSAGE_JSON_CHARS && Number.isFinite(row.createdAt));
  if (!safeRows.length) return;

  try {
    const db = await database();
    await db.withExclusiveTransactionAsync(async txn => {
      for (const row of safeRows) {
        await txn.runAsync(
          `INSERT INTO chat_message_cache (owner_id, conversation_id, message_id, created_at, value_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(owner_id, conversation_id, message_id) DO UPDATE SET
             created_at = excluded.created_at, value_json = excluded.value_json`,
          ownerId, conversationId, row.message.id, row.createdAt, row.json,
        );
      }
      await txn.runAsync(
        `DELETE FROM chat_message_cache
         WHERE owner_id = ? AND conversation_id = ? AND message_id NOT IN (
           SELECT message_id FROM chat_message_cache
           WHERE owner_id = ? AND conversation_id = ?
           ORDER BY created_at DESC, message_id DESC LIMIT ?
         )`,
        ownerId, conversationId, ownerId, conversationId, MAX_MESSAGES_PER_CONVERSATION,
      );
      await txn.runAsync(
        `DELETE FROM chat_message_cache WHERE owner_id = ? AND rowid IN (
           SELECT rowid FROM chat_message_cache WHERE owner_id = ?
           ORDER BY created_at DESC, message_id DESC LIMIT -1 OFFSET ?
         )`,
        ownerId, ownerId, MAX_MESSAGES_PER_OWNER,
      );
    });
  } catch {
    // The cache is not the source of truth and must never fail message delivery.
  }
}

/** Purge private cached messages for an account when the user explicitly signs out/deletes local data. */
export async function clearCachedChatMessages(ownerId: string): Promise<void> {
  if (!ownerId.trim()) return;
  try {
    const db = await database();
    await db.runAsync('DELETE FROM chat_message_cache WHERE owner_id = ?', ownerId);
  } catch {
    // Best-effort cleanup; all reads remain owner-scoped even if cleanup fails.
  }
}

/** Redact a locally cached message immediately when the server emits message:deleted. */
export async function markCachedChatMessageDeleted(
  ownerId: string,
  conversationId: string,
  messageId: string,
  deletedAt: string,
): Promise<void> {
  if (!ownerId.trim() || !conversationId.trim() || !messageId.trim()) return;
  try {
    const db = await database();
    const row = await db.getFirstAsync<CachedMessageRow>(
      `SELECT message_id, value_json, created_at FROM chat_message_cache
       WHERE owner_id = ? AND conversation_id = ? AND message_id = ? LIMIT 1`,
      ownerId, conversationId, messageId,
    );
    if (!row || row.value_json.length > MAX_MESSAGE_JSON_CHARS) return;
    const parsed: unknown = JSON.parse(row.value_json);
    if (!validMessage(parsed)) return;
    const redacted: ChatMessage = { ...parsed, body: '', imageUrl: null, audioUrl: null, fileUrl: null, deletedAt };
    await db.runAsync(
      `UPDATE chat_message_cache SET value_json = ?
       WHERE owner_id = ? AND conversation_id = ? AND message_id = ?`,
      JSON.stringify(redacted), ownerId, conversationId, messageId,
    );
  } catch {
    // Deletion propagation is best-effort; the next authorized REST sync is authoritative.
  }
}
