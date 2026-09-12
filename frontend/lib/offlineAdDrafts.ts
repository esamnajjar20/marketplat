/**
 * مسودات الإعلانات للأوفلاين — IndexedDB.
 *
 * المستخدم يكتب إعلانًا بدون نت → يُحفظ محليًا بحالة draft/pending_sync
 * وليس «تم النشر». عند عودة الاتصال: الرفع من مركز المزامنة أو تلقائيًا.
 *
 * لا نخزّن ملفات صور ضخمة كـ base64 بلا حد — فقط بيانات النص + أسماء
 * ملفات اختيارية؛ رفع الصور الفعلي يتم أونلاين.
 */

const DB_NAME = 'market-ad-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';
const MAX_DRAFTS = 20;

export type AdDraftStatus = 'draft' | 'pending_sync' | 'failed' | 'synced';

export interface AdDraftPayload {
  title: string;
  description: string;
  price?: string | number | null;
  categoryId?: string | null;
  city?: string | null;
  condition?: string | null;
  contactPhone?: string | null;
  /** معرفات/أسماء ملفات فقط — ليس محتوى الصور */
  imageLabels?: string[];
  [key: string]: unknown;
}

export interface AdDraft {
  id: string;
  mode: 'create' | 'edit';
  /** لمعرّف الإعلان عند التعديل */
  remoteAdId?: string | null;
  payload: AdDraftPayload;
  status: AdDraftStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متاح'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function listAdDrafts(): Promise<AdDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as AdDraft[])
        .filter((d) => d.status !== 'synced')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAdDraft(id: string): Promise<AdDraft | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as AdDraft) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAdDraft(
  input: {
    id?: string;
    mode: 'create' | 'edit';
    remoteAdId?: string | null;
    payload: AdDraftPayload;
    status?: AdDraftStatus;
    lastError?: string;
  },
): Promise<AdDraft> {
  const existing = input.id ? await getAdDraft(input.id) : null;
  const now = new Date().toISOString();
  const draft: AdDraft = {
    id: input.id ?? existing?.id ?? newId(),
    mode: input.mode,
    remoteAdId: input.remoteAdId ?? existing?.remoteAdId ?? null,
    payload: input.payload,
    status: input.status ?? existing?.status ?? 'draft',
    lastError: input.lastError,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // سقف عدد المسودات
  const all = await listAdDrafts();
  if (all.length > MAX_DRAFTS) {
    const excess = all.slice(MAX_DRAFTS);
    for (const d of excess) {
      await deleteAdDraft(d.id);
    }
  }

  return draft;
}

export async function deleteAdDraft(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllAdDrafts(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countPendingAdDrafts(): Promise<number> {
  const items = await listAdDrafts();
  return items.filter((d) => d.status === 'draft' || d.status === 'pending_sync' || d.status === 'failed')
    .length;
}
