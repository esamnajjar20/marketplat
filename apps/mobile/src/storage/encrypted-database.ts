import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { assertLegacyDataPreserved, type SqliteMigrationDatabase } from '@/storage/sqlite-migration-integrity';

/** All account/private queues and the public cache share one encrypted native database. */
export const ENCRYPTED_DATABASE_NAME = 'marketplat-private-v2.db';
const LEGACY_DATABASE_NAME = 'marketplat-public-cache.db';
const KEY_STORAGE_KEY = 'marketplat.mobile.sqlite-key.v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let transactionQueue: Promise<void> = Promise.resolve();

/** Serialize write transactions across all feature stores sharing this connection. */
function serializeTransaction<T>(work: () => Promise<T>): Promise<T> {
  const result = transactionQueue.then(work, work);
  transactionQueue = result.then(() => undefined, () => undefined);
  return result;
}

function databasePath(name: string): string | null {
  const directory = SQLite.defaultDatabaseDirectory;
  return typeof directory === 'string' && directory.length > 0 ? `${directory.replace(/\/$/, '')}/${name}` : null;
}

async function databaseExists(name: string): Promise<boolean> {
  const path = databasePath(name);
  if (!path) return false;
  try { return (await FileSystem.getInfoAsync(path)).exists; } catch { return false; }
}

function createRandomKeyHex(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('لا يمكن إنشاء مفتاح تشفير آمن على هذا الجهاز؛ لم يتم فتح قاعدة البيانات.');
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function assertSqlCipher(db: SQLite.SQLiteDatabase): Promise<void> {
  const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error('التشفير المحلي غير متاح في هذه النسخة. يجب بناء التطبيق الأصلي مع SQLCipher قبل استخدام التخزين المحلي.');
  }
}

async function openKeyed(name: string, keyHex: string): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  try {
    // Contention between chat, favorites, drafts and sync workers should wait
    // briefly rather than immediately surfacing SQLITE_BUSY (error code 5).
    await db.execAsync('PRAGMA busy_timeout = 8000;');
    await assertSqlCipher(db);
    await db.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    // Force SQLite to authenticate the key now, not later during an unrelated write.
    await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function verifyLegacyCopyBeforeRemoval(keyHex: string): Promise<void> {
  if (!(await databaseExists(LEGACY_DATABASE_NAME))) return;
  const legacy = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  let encrypted: SQLite.SQLiteDatabase | null = null;
  try {
    encrypted = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
    await assertLegacyDataPreserved(legacy as unknown as SqliteMigrationDatabase, encrypted as unknown as SqliteMigrationDatabase);
  } finally {
    await legacy.closeAsync().catch(() => undefined);
    await encrypted?.closeAsync().catch(() => undefined);
  }
}

async function migrateLegacyDatabase(keyHex: string): Promise<void> {
  // Open the old database without a key. SQLCipher accepts legacy plaintext SQLite files.
  // The key is hex-only and the destination name is a fixed constant, never user input.
  const legacy = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  try {
    await assertSqlCipher(legacy);
    await legacy.execAsync('PRAGMA journal_mode = DELETE;');
    await legacy.execAsync(
      `ATTACH DATABASE '${ENCRYPTED_DATABASE_NAME}' AS encrypted KEY "x'${keyHex}'";\n` +
      `SELECT sqlcipher_export('encrypted');\n` +
      'DETACH DATABASE encrypted;'
    );
  } catch (error) {
    await legacy.closeAsync().catch(() => undefined);
    // Do not delete the plaintext source on any migration failure.
    throw error;
  }
  await legacy.closeAsync();

  const encrypted = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
  await encrypted.execAsync('PRAGMA journal_mode = DELETE;');
  await encrypted.closeAsync();
  // A keyed open/schema read alone is insufficient: verify every legacy user table
  // and its row count before destroying the only plaintext copy.
  await verifyLegacyCopyBeforeRemoval(keyHex);
  await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
}

async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Expo web/SQLite WASM does not support SQLCipher. Fail closed instead of
  // storing account snapshots, credentials-related state, or queued writes in plaintext.
  if (Platform.OS === 'web') {
    throw new Error('التخزين المحلي الآمن غير متاح على نسخة الويب. استخدم تطبيق Android أو iOS لحفظ البيانات دون اتصال.');
  }

  let keyHex = await SecureStore.getItemAsync(KEY_STORAGE_KEY);
  const encryptedExists = await databaseExists(ENCRYPTED_DATABASE_NAME);
  if (!keyHex) {
    if (encryptedExists) {
      throw new Error('مفتاح تشفير قاعدة البيانات غير موجود. أوقفنا الوصول منعًا لفقدان البيانات أو إنشاء قاعدة بديلة.');
    }
    keyHex = createRandomKeyHex();
    await SecureStore.setItemAsync(KEY_STORAGE_KEY, keyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  if (encryptedExists) {
    // If a previous run crashed after exporting but before deleting the legacy DB,
    // validate the encrypted copy first, then remove the old plaintext file.
    const encrypted = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
    await encrypted.execAsync('PRAGMA busy_timeout = 8000; PRAGMA journal_mode = WAL;');
    await encrypted.closeAsync();
    if (await databaseExists(LEGACY_DATABASE_NAME)) {
      // A previous run may have been interrupted; preserve the source until every
      // legacy table and row count is confirmed in the encrypted database.
      await verifyLegacyCopyBeforeRemoval(keyHex);
      await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
    }
  } else {
    await migrateLegacyDatabase(keyHex);
  }

  const db = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
  await db.execAsync('PRAGMA busy_timeout = 8000; PRAGMA journal_mode = WAL;');
  // Expo's exclusive transaction API creates a fresh connection, which does not inherit
  // PRAGMA key. Use the already-keyed connection for transactions in this encrypted DB.
  // Callers keep each transaction callback short and perform no network awaits inside it.
  (db as unknown as { withExclusiveTransactionAsync: (task: (txn: SQLite.SQLiteDatabase) => Promise<void>) => Promise<void> })
    .withExclusiveTransactionAsync = async (task) => serializeTransaction(async () => {
      await db.withTransactionAsync(async () => task(db));
    });
  return db;
}

/** Single-flight initialization prevents two feature stores racing the one-time migration. */
export function openEncryptedDatabaseAsync(_legacyName?: string): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openEncryptedDatabase().catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}
