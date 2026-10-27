import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

const DATABASE_NAME = 'marketplat-public-cache.db';
const MEDIA_DIRECTORY = `${FileSystem.documentDirectory ?? ''}marketplat-chat-media-outbox/`;
const MAX_PENDING_MEDIA = 30;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
export type ChatMediaKind = 'image' | 'audio' | 'file';
export type ChatMediaOutboxItem = { id: string; ownerId: string; conversationId: string; kind: ChatMediaKind; uri: string; fileName: string; mimeType: string; sizeBytes: number; operationId: string; createdAt: number; attempts: number; lastError: string | null };
type Row = { id: string; owner_id: string; conversation_id: string; kind: string; uri: string; file_name: string; mime_type: string; size_bytes: number; operation_id: string; created_at: number; attempts: number; next_attempt_at: number; last_error: string | null };
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function database() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async db => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS chat_media_outbox (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, conversation_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, operation_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT); CREATE INDEX IF NOT EXISTS chat_media_outbox_owner_created_idx ON chat_media_outbox(owner_id, created_at);`);
    return db;
  }).catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}
function map(row: Row): ChatMediaOutboxItem { return { id: row.id, ownerId: row.owner_id, conversationId: row.conversation_id, kind: row.kind as ChatMediaKind, uri: row.uri, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, operationId: row.operation_id, createdAt: row.created_at, attempts: row.attempts, lastError: row.last_error }; }
function safeName(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'attachment.bin'; }
export function createChatMediaOperationId(kind: ChatMediaKind): string { return `chat-${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`; }
export async function enqueueChatMedia(input: { ownerId: string; conversationId: string; kind: ChatMediaKind; uri: string; fileName: string; mimeType: string; operationId?: string }): Promise<ChatMediaOutboxItem> {
  if (!input.ownerId.trim() || !input.conversationId.trim()) throw new Error('يجب تحديد الحساب والمحادثة قبل حفظ المرفق.');
  if (!/^(file|content):\/\//i.test(input.uri)) throw new Error('تعذر حفظ المرفق؛ أعد اختياره من الجهاز.');
  if (!FileSystem.documentDirectory) throw new Error('مساحة الحفظ الدائم غير متاحة على الجهاز.');
  const source = await FileSystem.getInfoAsync(input.uri);
  const maxBytes = input.kind === 'image' ? 5 * 1024 * 1024 : input.kind === 'audio' ? 8 * 1024 * 1024 : MAX_MEDIA_BYTES;
  if (!source.exists || source.isDirectory || !source.size || source.size > maxBytes) throw new Error(input.kind === 'image' ? 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت.' : input.kind === 'audio' ? 'حجم التسجيل الصوتي يجب ألا يتجاوز 8 ميغابايت.' : 'حجم الملف يجب ألا يتجاوز 15 ميغابايت.');
  await FileSystem.makeDirectoryAsync(MEDIA_DIRECTORY, { intermediates: true }).catch(() => undefined);
  const operationId = input.operationId || createChatMediaOperationId(input.kind);
  const fileName = safeName(input.fileName);
  const destination = `${MEDIA_DIRECTORY}${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileName}`;
  await FileSystem.copyAsync({ from: input.uri, to: destination });
  const copied = await FileSystem.getInfoAsync(destination);
  if (!copied.exists || copied.isDirectory || copied.size !== source.size) { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined); throw new Error('لم يكتمل حفظ المرفق محليًا؛ أعد المحاولة.'); }
  const db = await database();
  try {
    await db.withExclusiveTransactionAsync(async txn => {
      const count = await txn.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM chat_media_outbox WHERE owner_id = ?', input.ownerId);
      if ((count?.count ?? 0) >= MAX_PENDING_MEDIA) throw new Error('طابور المرفقات ممتلئ. أرسل المرفقات المحفوظة أولًا.');
      await txn.runAsync('INSERT INTO chat_media_outbox (id, owner_id, conversation_id, kind, uri, file_name, mime_type, size_bytes, operation_id, created_at, attempts, next_attempt_at, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)', `chat-media:${operationId}`, input.ownerId, input.conversationId, input.kind, destination, fileName, input.mimeType, copied.size, operationId, Date.now());
    });
  } catch (error) { await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined); throw error; }
  const row = await db.getFirstAsync<Row>('SELECT * FROM chat_media_outbox WHERE operation_id = ?', operationId);
  if (!row) throw new Error('تعذر التحقق من حفظ المرفق في طابور الإرسال.');
  return map(row);
}
export async function listChatMediaOutbox(ownerId: string): Promise<ChatMediaOutboxItem[]> { if (!ownerId.trim()) return []; const db = await database(); return (await db.getAllAsync<Row>('SELECT * FROM chat_media_outbox WHERE owner_id = ? ORDER BY created_at ASC LIMIT ?', ownerId, MAX_PENDING_MEDIA)).map(map); }
export async function listDueChatMediaOutbox(ownerId: string, now = Date.now()): Promise<ChatMediaOutboxItem[]> { if (!ownerId.trim()) return []; const db = await database(); return (await db.getAllAsync<Row>('SELECT * FROM chat_media_outbox WHERE owner_id = ? AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT ?', ownerId, now, MAX_PENDING_MEDIA)).map(map); }
export async function acknowledgeChatMedia(operationId: string, ownerId: string): Promise<void> { const db = await database(); const row = await db.getFirstAsync<Row>('SELECT * FROM chat_media_outbox WHERE operation_id = ? AND owner_id = ?', operationId, ownerId); if (!row) return; await db.runAsync('DELETE FROM chat_media_outbox WHERE operation_id = ? AND owner_id = ?', operationId, ownerId); if (FileSystem.documentDirectory && row.uri.startsWith(MEDIA_DIRECTORY)) await FileSystem.deleteAsync(row.uri, { idempotent: true }).catch(() => undefined); }
export async function deferChatMedia(operationId: string, ownerId: string, error: unknown): Promise<void> { const db = await database(); const message = (error instanceof Error ? error.message : 'تعذرت مزامنة المرفق.').slice(0, 400); await db.runAsync('UPDATE chat_media_outbox SET next_attempt_at = ? + MIN(5000 * (1 << MIN(attempts, 10)), 3600000), attempts = attempts + 1, last_error = ? WHERE operation_id = ? AND owner_id = ?', Date.now(), message, operationId, ownerId); }
export async function discardChatMedia(operationId: string, ownerId: string): Promise<void> { await acknowledgeChatMedia(operationId, ownerId); }
