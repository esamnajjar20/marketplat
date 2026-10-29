import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { ApiError, apiRequest } from '@/api/client';
import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OfflineCreateKind = 'create-product' | 'create-service' | 'create-sale';
export type OfflineCreatePayload = Record<string, unknown>;

export type OfflineCreateItem = {
  id: string;
  ownerId: string;
  operation: OfflineCreateKind;
  payload: OfflineCreatePayload;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  state: string;
};

type Row = {
  id: string;
  owner_id: string;
  operation: OfflineCreateKind;
  payload_json: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  next_attempt_at: number;
  state: string;
  lease_until: number;
};

export type OfflineSyncOutcome = 'synced' | 'nothing-due' | 'retry-scheduled' | 'login-required';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DATABASE_NAME = 'marketplat-public-cache.db';
const MAX_PENDING = 50;
const MAX_ATTEMPTS = 8;
const LEASE_DURATION_MS = 30_000;
const LEASE_RECOVERY_DELAY_MS = 5_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PAYLOAD_MAX_CHARS = 100_000;
const ALLOWED_IMAGE_MIMES = /^image\/(jpeg|jpg|png|webp)$/;

// Broader credential detection — matches mutation-outbox.ts's CREDENTIAL_KEY
// so both queues reject the same sensitive keys consistently.
const CREDENTIAL_KEY = /^(?:access[_-]?token|refresh[_-]?token|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|api[_-]?key|csrf[_-]?token|session[_-]?token|jwt|bearer)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Database bootstrap
// ─────────────────────────────────────────────────────────────────────────────

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const activeSyncByOwner = new Map<string, Promise<OfflineSyncOutcome>>();

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openEncryptedDatabaseAsync(DATABASE_NAME)
      .then(async (db) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS entity_create_outbox (
            id TEXT PRIMARY KEY NOT NULL,
            owner_id TEXT NOT NULL,
            operation TEXT NOT NULL CHECK(operation IN ('create-product','create-service','create-sale')),
            payload_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            next_attempt_at INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL DEFAULT 'pending',
            lease_until INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS entity_create_outbox_owner_created_idx
            ON entity_create_outbox(owner_id, created_at);

          CREATE TABLE IF NOT EXISTS offline_creation_reference_cache (
            cache_key TEXT PRIMARY KEY NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
        // Recover expired processing leases on startup. A still-valid lease belongs
        // to a worker that may be waiting for a server response.
        await db.runAsync(
          "UPDATE entity_create_outbox SET state='pending', lease_until=0, next_attempt_at=MAX(next_attempt_at, ?) WHERE state='processing' AND lease_until <= ?",
          Date.now() + LEASE_RECOVERY_DELAY_MS,
          Date.now(),
        );
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function hasCredentialField(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((key) => CREDENTIAL_KEY.test(key));
}

function validate(kind: OfflineCreateKind, payload: unknown): asserts payload is OfflineCreatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('بيانات الإضافة المحفوظة غير صالحة.');
  }
  const p = payload as Record<string, unknown>;

  if (hasCredentialField(p)) {
    throw new Error('لا يمكن حفظ بيانات اعتماد ضمن طابور الإضافة.');
  }

  if (kind === 'create-product') {
    if (
      typeof p.categoryId !== 'string' || !p.categoryId ||
      typeof p.name !== 'string' || p.name.trim().length < 2 ||
      typeof p.description !== 'string' || p.description.trim().length < 10 ||
      typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0
    ) {
      throw new Error('بيانات المنتج غير مكتملة.');
    }
  }

  if (kind === 'create-service') {
    if (
      typeof p.categoryId !== 'string' || !p.categoryId ||
      typeof p.title !== 'string' || p.title.trim().length < 3 ||
      typeof p.description !== 'string' || p.description.trim().length < 10 ||
      !['FIXED', 'STARTING_FROM', 'NEGOTIABLE'].includes(String(p.pricingType)) ||
      !['AT_CUSTOMER', 'AT_PROVIDER', 'REMOTE'].includes(String(p.serviceLocation))
    ) {
      throw new Error('بيانات الخدمة غير مكتملة.');
    }
  }

  if (kind === 'create-sale') {
    if (
      typeof p.entityTitle !== 'string' || !p.entityTitle.trim() ||
      typeof p.buyerName !== 'string' || !p.buyerName.trim() ||
      typeof p.quantity !== 'number' || !Number.isInteger(p.quantity) || p.quantity < 1 ||
      typeof p.unitPrice !== 'number' || !Number.isFinite(p.unitPrice) || p.unitPrice < 0 ||
      !['FREE', 'PRODUCT', 'AD', 'SERVICE'].includes(String(p.entityType))
    ) {
      throw new Error('بيانات البيع غير مكتملة.');
    }

    if (p.manualItems !== undefined) {
      const items = p.manualItems;
      const itemsValid =
        Array.isArray(items) &&
        items.length >= 2 &&
        items.length <= 200 &&
        items.every((item) => {
          if (!item || typeof item !== 'object') return false;
          const i = item as { title?: unknown; quantity?: unknown; unitPrice?: unknown };
          if (typeof i.title !== 'string' || !i.title.trim()) return false;
          if (typeof i.quantity !== 'number' || !Number.isInteger(i.quantity) || i.quantity < 1) return false;
          if (typeof i.unitPrice !== 'number' || !Number.isFinite(i.unitPrice) || i.unitPrice < 0) return false;
          return true;
        });
      if (!itemsValid) {
        throw new Error('بنود الفاتورة المتعددة غير صالحة.');
      }
    }
  }

  if (kind !== 'create-sale') {
    const images = p.images;
    const imagesValid =
      Array.isArray(images) &&
      images.length >= 1 &&
      images.length <= 10 &&
      images.every((image) => {
        if (!image || typeof image !== 'object') return false;
        const i = image as { uri?: unknown; fileName?: unknown; mimeType?: unknown };
        return typeof i.uri === 'string'
          && typeof i.fileName === 'string'
          && typeof i.mimeType === 'string';
      });
    if (!imagesValid) {
      throw new Error('يجب حفظ صورة واحدة على الأقل مع المنتج أو الخدمة.');
    }
  }

  if (JSON.stringify(payload).length > PAYLOAD_MAX_CHARS) {
    throw new Error('حجم بيانات الإضافة يتجاوز الحد المسموح.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue operations
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueueOfflineCreate(
  ownerId: string,
  id: string,
  operation: OfflineCreateKind,
  payload: OfflineCreatePayload,
): Promise<void> {
  if (
    !ownerId.trim() ||
    ownerId.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(id)
  ) {
    throw new Error('تعذر تحديد الحساب أو معرّف العملية.');
  }
  validate(operation, payload);

  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const count = await tx.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM entity_create_outbox WHERE owner_id = ? AND state IN ('pending','processing')",
      ownerId,
    );
    if ((count?.count ?? 0) >= MAX_PENDING) {
      throw new Error('طابور الإضافات ممتلئ؛ اتصل بالإنترنت للمزامنة أولًا.');
    }
    await tx.runAsync(
      "INSERT INTO entity_create_outbox (id, owner_id, operation, payload_json, created_at, attempts, last_error, next_attempt_at, state, lease_until) VALUES (?, ?, ?, ?, ?, 0, NULL, 0, 'pending', 0)",
      id,
      ownerId,
      operation,
      JSON.stringify(payload),
      Date.now(),
    );
  });
}

export async function listOfflineCreates(ownerId?: string | null): Promise<OfflineCreateItem[]> {
  if (!ownerId?.trim()) return [];
  const db = await database();
  const rows = await db.getAllAsync<Row>(
    'SELECT * FROM entity_create_outbox WHERE owner_id = ? ORDER BY created_at ASC LIMIT ?',
    ownerId,
    MAX_PENDING,
  );
  return rows.map((row) => {
    let payload: OfflineCreatePayload = {};
    try {
      const parsed: unknown = JSON.parse(row.payload_json);
      validate(row.operation, parsed);
      payload = parsed;
    } catch {
      payload = {};
    }
    return {
      id: row.id,
      ownerId: row.owner_id,
      operation: row.operation,
      payload,
      createdAt: row.created_at,
      attempts: row.attempts,
      lastError: row.last_error,
      nextAttemptAt: row.next_attempt_at,
      state: row.state,
    };
  });
}

export async function isOfflineCreateImageReferenced(uri: string): Promise<boolean> {
  if (!uri.startsWith('file://')) return false;
  const db = await database();
  const rows = await db.getAllAsync<{ payload_json: string }>(
    'SELECT payload_json FROM entity_create_outbox',
  );
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as { images?: Array<{ uri?: string }> };
      if (Array.isArray(payload.images) && payload.images.some((image) => image?.uri === uri)) {
        return true;
      }
    } catch {
      // Malformed retained row is not proof the image is unused — keep it.
      return true;
    }
  }
  return false;
}

export async function discardOfflineCreate(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    "DELETE FROM entity_create_outbox WHERE id = ? AND owner_id = ? AND state = 'pending'",
    id,
    ownerId,
  );
  return result.changes === 1;
}

export async function retryOfflineCreate(id: string, ownerId?: string | null): Promise<boolean> {
  if (!id.trim() || !ownerId?.trim()) return false;
  const db = await database();
  const result = await db.runAsync(
    "UPDATE entity_create_outbox SET attempts=0, last_error=NULL, next_attempt_at=0, state='pending', lease_until=0 WHERE id=? AND owner_id=? AND state='pending' AND attempts >= ?",
    id,
    ownerId,
    MAX_ATTEMPTS,
  );
  return result.changes === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference-data cache (used by offline forms to remember category lists, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export async function cacheOfflineCreationReferenceData(key: string, value: unknown): Promise<void> {
  if (!/^[a-z0-9-]{2,80}$/.test(key)) return;
  const json = JSON.stringify(value);
  if (json.length > 200_000) return;
  const db = await database();
  await db.runAsync(
    'INSERT INTO offline_creation_reference_cache (cache_key, payload_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at',
    key,
    json,
    Date.now(),
  );
}

export async function readOfflineCreationReferenceData<T>(key: string): Promise<T | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload_json: string }>(
    'SELECT payload_json FROM offline_creation_reference_cache WHERE cache_key = ?',
    key,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync worker
// ─────────────────────────────────────────────────────────────────────────────

function endpointForKind(kind: OfflineCreateKind): string {
  switch (kind) {
    case 'create-product': return '/api/v1/products';
    case 'create-service': return '/api/v1/service-listings';
    case 'create-sale': return '/api/v1/sales';
  }
}

/** Build the multipart body for a create with images, or JSON body when no images. */
async function buildCreateBody(payload: Record<string, unknown>): Promise<BodyInit> {
  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const clean: Record<string, unknown> = { ...payload };
  delete clean.images;

  if (rawImages.length === 0) {
    return JSON.stringify(clean);
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(clean)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  for (const [index, value] of rawImages.entries()) {
    if (!value || typeof value !== 'object') {
      throw new Error('قائمة صور الإضافة غير صالحة.');
    }
    const image = value as { uri?: unknown; fileName?: unknown; mimeType?: unknown };
    if (
      typeof image.uri !== 'string' ||
      !image.uri.startsWith('file://') ||
      typeof image.fileName !== 'string' ||
      typeof image.mimeType !== 'string' ||
      !ALLOWED_IMAGE_MIMES.test(image.mimeType)
    ) {
      throw new Error('صورة الإضافة غير محفوظة محليًا بصورة صالحة.');
    }
    const info = await FileSystem.getInfoAsync(image.uri);
    if (
      !info.exists ||
      info.isDirectory ||
      typeof info.size !== 'number' ||
      info.size <= 0 ||
      info.size > IMAGE_MAX_BYTES
    ) {
      throw new Error(`صورة الإضافة رقم ${index + 1} غير موجودة أو يتجاوز حجمها 5MB.`);
    }
    form.append('images', {
      uri: image.uri,
      name: image.fileName,
      type: image.mimeType,
    } as unknown as Blob);
  }

  return form;
}

export async function syncNextOfflineCreate(input: {
  isOnline: boolean;
  token?: string | null;
  ownerId?: string | null;
  csrfToken?: string | null;
}): Promise<OfflineSyncOutcome> {
  const key = input.ownerId?.trim() || '__missing_owner__';
  const existing = activeSyncByOwner.get(key);
  if (existing) return existing;

  const work = (async (): Promise<OfflineSyncOutcome> => {
    if (!input.isOnline) return 'nothing-due';
    if (!input.token?.trim() || !input.ownerId?.trim()) return 'login-required';

    const db = await database();
    const now = Date.now();

    // Recover expired processing leases before selecting the FIFO head.
    await db.runAsync(
      "UPDATE entity_create_outbox SET state='pending', lease_until=0, next_attempt_at=MAX(next_attempt_at, ?) WHERE state='processing' AND lease_until <= ?",
      now + LEASE_RECOVERY_DELAY_MS,
      now,
    );

    // Read the true FIFO head (including backoff/exhausted/processing rows),
    // so a newer operation cannot leapfrog an older one.
    const head = await db.getFirstAsync<Row>(
      'SELECT * FROM entity_create_outbox WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1',
      input.ownerId,
    );
    if (
      !head ||
      head.next_attempt_at > now ||
      head.attempts >= MAX_ATTEMPTS ||
      head.state === 'processing'
    ) {
      return 'nothing-due';
    }

    const claimed = await db.runAsync(
      "UPDATE entity_create_outbox SET state='processing', lease_until=? WHERE id=? AND owner_id=? AND state='pending' AND next_attempt_at <= ?",
      now + LEASE_DURATION_MS,
      head.id,
      input.ownerId,
      now,
    );
    if (claimed.changes !== 1) return 'nothing-due';

    try {
      const parsed: unknown = JSON.parse(head.payload_json);
      validate(head.operation, parsed);

      const headers: Record<string, string> = { 'X-Offline-Op-Id': head.id };
      if (input.csrfToken) headers['X-CSRF-Token'] = input.csrfToken;

      const body = await buildCreateBody(parsed as Record<string, unknown>);

      const response = await apiRequest<{ success: boolean; message?: string; data?: unknown }>(
        endpointForKind(head.operation),
        {
          method: 'POST',
          token: input.token,
          timeoutMs: 12_000,
          headers,
          body,
        },
      );
      if (!response || response.success !== true || response.data === undefined) {
        throw new Error(response?.message || 'لم يؤكد الخادم إنشاء السجل.');
      }

      await db.runAsync(
        "DELETE FROM entity_create_outbox WHERE id = ? AND owner_id = ? AND state = 'processing'",
        head.id,
        input.ownerId,
      );
      return 'synced';
    } catch (error) {
      const attempts = head.attempts + 1;
      const delay = Math.min(60 * 60_000, 5_000 * 2 ** Math.min(attempts - 1, 10));
      const message = (error instanceof Error ? error.message : 'تعذرت المزامنة.').slice(0, 500);
      await db.runAsync(
        "UPDATE entity_create_outbox SET state='pending', attempts=?, last_error=?, next_attempt_at=?, lease_until=0 WHERE id=? AND owner_id=?",
        attempts,
        message,
        Date.now() + delay,
        head.id,
        input.ownerId,
      );
      return error instanceof ApiError && (error.status === 401 || error.status === 403)
        ? 'login-required'
        : 'retry-scheduled';
    }
  })();

  activeSyncByOwner.set(key, work);
  void work
    .finally(() => {
      if (activeSyncByOwner.get(key) === work) activeSyncByOwner.delete(key);
    })
    .catch(() => {
      // Prevent an unhandled rejection from the cleanup promise.
    });
  return work;
}
