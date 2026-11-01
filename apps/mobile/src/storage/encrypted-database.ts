import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { assertLegacyDataPreserved, type SqliteMigrationDatabase } from '@/storage/sqlite-migration-integrity';
import * as Crypto from 'expo-crypto';
import { isValidSqlCipherKey } from './sqlcipher-key-policy.mjs';
export { isValidSqlCipherKey } from './sqlcipher-key-policy.mjs';

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
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function assertSqlCipher(db: SQLite.SQLiteDatabase): Promise<void> {
  const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error('التشفير المحلي غير متاح في هذه النسخة. يجب بناء التطبيق الأصلي مع SQLCipher قبل استخدام التخزين المحلي.');
  }
}

async function openKeyed(name: string, keyHex: string): Promise<SQLite.SQLiteDatabase> {
  if (!isValidSqlCipherKey(keyHex)) throw new Error('مفتاح SQLCipher غير صالح؛ أُوقف فتح قاعدة البيانات لحماية البيانات.');
  const db = await SQLite.openDatabaseAsync(name);
  try {
    // Contention between chat, favorites, drafts and sync workers should wait
    // briefly rather than immediately surfacing SQLITE_BUSY (error code 5).
    await db.execAsync('PRAGMA busy_timeout = 8000;');
    await assertSqlCipher(db);
    await db.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    // Force SQLite to authenticate the key now, not later during an unrelated write.
    await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
    const integrityRows = await db.getAllAsync<{ quick_check: string }>('PRAGMA quick_check');
    if (integrityRows.length !== 1 || integrityRows[0]?.quick_check !== 'ok') {
      throw new Error('فشل فحص سلامة قاعدة البيانات المحلية المشفرة. لم نغيّر الملف أو نحذف بياناته.');
    }
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

async function removeIncompleteEncryptedDatabase(): Promise<void> {
  if (!(await databaseExists(ENCRYPTED_DATABASE_NAME))) return;
  await SQLite.deleteDatabaseAsync(ENCRYPTED_DATABASE_NAME);
}

async function migrateLegacyDatabase(keyHex: string): Promise<void> {
  // The caller only enters migration when no encrypted destination exists. If an
  // earlier attempt left a partial destination, it is removed only while the
  // plaintext source is still present and before a fresh export is attempted.
  const legacyExists = await databaseExists(LEGACY_DATABASE_NAME);
  if (!legacyExists) throw new Error('قاعدة البيانات القديمة غير موجودة؛ أُوقف الترحيل دون إنشاء قاعدة فارغة.');
  if (await databaseExists(ENCRYPTED_DATABASE_NAME)) {
    await removeIncompleteEncryptedDatabase();
  }

  const legacy = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  const destinationPath = databasePath(ENCRYPTED_DATABASE_NAME);
  if (!destinationPath) {
    await legacy.closeAsync().catch(() => undefined);
    throw new Error('تعذر تحديد مسار قاعدة البيانات المشفرة على الجهاز.');
  }
  // ATTACH resolves relative paths against the native process working directory,
  // which is not guaranteed to be SQLite.defaultDatabaseDirectory.
  const escapedDestinationPath = destinationPath.replace(/'/g, "''");
  try {
    await assertSqlCipher(legacy);
    await legacy.execAsync('PRAGMA journal_mode = DELETE;');
    await legacy.execAsync(
      `ATTACH DATABASE '${escapedDestinationPath}' AS encrypted KEY "x'${keyHex}'";\n` +
      `SELECT sqlcipher_export('encrypted');\n` +
      'DETACH DATABASE encrypted;'
    );
  } catch (error) {
    await legacy.closeAsync().catch(() => undefined);
    // The old source is still authoritative. Remove only the partial target so
    // the next launch can retry rather than getting stuck on a corrupt file.
    await removeIncompleteEncryptedDatabase().catch(() => undefined);
    throw error;
  }
  await legacy.closeAsync();

  let encrypted: SQLite.SQLiteDatabase | null = null;
  try {
    encrypted = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
    await encrypted.execAsync('PRAGMA journal_mode = DELETE;');
    await encrypted.closeAsync();
    encrypted = null;
    // A keyed open/schema read alone is insufficient: verify every legacy user table
    // and every row before destroying the only plaintext copy.
    await verifyLegacyCopyBeforeRemoval(keyHex);
  } catch (error) {
    await encrypted?.closeAsync().catch(() => undefined);
    // Export may have produced a syntactically valid but incomplete database. Keep
    // the original and clear the failed destination so the migration is repeatable.
    await removeIncompleteEncryptedDatabase().catch(() => undefined);
    throw error;
  }

  await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
}

async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Expo web/SQLite WASM does not support SQLCipher. Fail closed instead of
  // storing account snapshots, credentials-related state, or queued writes in plaintext.
  if (Platform.OS === 'web') {
    throw new Error('التخزين المحلي الآمن غير متاح على نسخة الويب. استخدم تطبيق Android أو iOS لحفظ البيانات دون اتصال.');
  }

  let keyHex = await SecureStore.getItemAsync(KEY_STORAGE_KEY);
  let encryptedExists = await databaseExists(ENCRYPTED_DATABASE_NAME);
  const legacyExists = await databaseExists(LEGACY_DATABASE_NAME);

  if (keyHex && !isValidSqlCipherKey(keyHex)) {
    if (encryptedExists && !legacyExists) {
      throw new Error('مفتاح تشفير قاعدة البيانات تالف أو غير صالح. أوقفنا الوصول لحماية البيانات؛ افتح إعدادات التخزين لمراجعة الاسترداد.');
    }
    // A legacy plaintext source is still available, or there is no DB at all.
    // Replace malformed key material and re-export from that authoritative source.
    keyHex = null;
  }

  if (!keyHex) {
    if (encryptedExists && !legacyExists) {
      throw new Error('مفتاح تشفير قاعدة البيانات غير موجود. أوقفنا الوصول منعًا لفقدان البيانات أو إنشاء قاعدة بديلة.');
    }
    keyHex = createRandomKeyHex();
    await SecureStore.setItemAsync(KEY_STORAGE_KEY, keyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (encryptedExists && legacyExists) {
      // An encrypted export was left beside its intact legacy source before the
      // key disappeared. The legacy copy permits a safe re-export with a new key.
      await removeIncompleteEncryptedDatabase();
      encryptedExists = false;
    }
  }

  if (encryptedExists) {
    try {
      // If a previous run crashed after exporting but before deleting the legacy DB,
      // validate the encrypted copy first, then remove the old plaintext file.
      const encrypted = await openKeyed(ENCRYPTED_DATABASE_NAME, keyHex);
      try {
        await encrypted.execAsync('PRAGMA busy_timeout = 8000; PRAGMA journal_mode = WAL;');
      } finally {
        await encrypted.closeAsync().catch(() => undefined);
      }
    } catch (error) {
      if (!(await databaseExists(LEGACY_DATABASE_NAME))) throw error;
      // The legacy source remains intact, so discard only the failed export and retry.
      await removeIncompleteEncryptedDatabase();
      await migrateLegacyDatabase(keyHex);
      encryptedExists = await databaseExists(ENCRYPTED_DATABASE_NAME);
    }

    if (encryptedExists && await databaseExists(LEGACY_DATABASE_NAME)) {
      try {
        await verifyLegacyCopyBeforeRemoval(keyHex);
        await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
      } catch {
        // This is the interrupted-export case: keep the legacy copy, rebuild the
        // encrypted destination, and let the migration verify all rows again.
        await removeIncompleteEncryptedDatabase();
        await migrateLegacyDatabase(keyHex);
      }
    }
  } else if (await databaseExists(LEGACY_DATABASE_NAME)) {
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


/** True only when SecureStore can be read and the encrypted DB exists without a usable key. */
export async function hasMissingEncryptedDatabaseKey(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [key, exists] = await Promise.all([
      SecureStore.getItemAsync(KEY_STORAGE_KEY),
      databaseExists(ENCRYPTED_DATABASE_NAME),
    ]);
    return !isValidSqlCipherKey(key) && exists;
  } catch {
    // A SecureStore outage is not proof that the key was lost; never offer destructive reset.
    return false;
  }
}

/**
 * Destructive recovery available only after the UI has obtained explicit user consent.
 * It refuses to run if a valid key is present, and leaves a possible legacy migration source intact.
 */
export async function resetEncryptedDatabaseAfterMissingKey(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('إعادة ضبط التخزين المحلي المشفر متاحة في تطبيق Android أو iOS فقط.');
  }
  if (databasePromise) {
    throw new Error('قاعدة البيانات مفتوحة بالفعل. أغلق التطبيق وأعد تشغيله قبل محاولة الاسترداد.');
  }

  let existingKey: string | null;
  try {
    existingKey = await SecureStore.getItemAsync(KEY_STORAGE_KEY);
  } catch {
    throw new Error('تعذر التحقق من مفتاح التشفير في التخزين الآمن؛ لم نحذف أي بيانات.');
  }
  if (isValidSqlCipherKey(existingKey)) {
    throw new Error('مفتاح التشفير صالح وموجود. أُلغيت إعادة الضبط لحماية قاعدة البيانات الحالية.');
  }

  const path = databasePath(ENCRYPTED_DATABASE_NAME);
  if (!path || !(await databaseExists(ENCRYPTED_DATABASE_NAME))) {
    throw new Error('قاعدة البيانات المشفرة غير موجودة أو تعذر تحديد مسارها؛ لا حاجة إلى إعادة ضبطها.');
  }

  // Delete only the database whose key is missing. Never touch SecureStore or a legacy
  // plaintext migration source here. The new key is persisted only after deletion succeeds.
  await SQLite.deleteDatabaseAsync(ENCRYPTED_DATABASE_NAME);
  const newKey = createRandomKeyHex();
  await SecureStore.setItemAsync(KEY_STORAGE_KEY, newKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  databasePromise = null;
  transactionQueue = Promise.resolve();
}
