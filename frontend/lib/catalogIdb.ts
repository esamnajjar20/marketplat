/**
 * IndexedDB لتخزين محتوى كتالوج HTML كاملًا — فتح دون إنترنت من صفحة التنزيلات.
 */

const DB_NAME = 'marketplat-offline';
const DB_VERSION = 1;
const STORE = 'catalogs';

export interface CatalogBlobRecord {
  id: string;
  storeId: string;
  storeName: string;
  fileName: string;
  productCount: number;
  html: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('storeId', 'storeId', { unique: false });
      }
    };
  });
}

export async function idbPutCatalog(record: CatalogBlobRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    // استبدال نسخة سابقة لنفس المتجر
    const idx = store.index('storeId');
    const getAll = idx.getAll(record.storeId);
    getAll.onsuccess = () => {
      const old = (getAll.result as CatalogBlobRecord[]) ?? [];
      for (const o of old) {
        if (o.id !== record.id) store.delete(o.id);
      }
      store.put(record);
    };
  });
}

export async function idbGetCatalog(id: string): Promise<CatalogBlobRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as CatalogBlobRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteCatalog(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}

/** فتح الكتالوج في تبويب جديد من Blob (يعمل دون نت) */
export async function openCatalogOffline(id: string): Promise<boolean> {
  const rec = await idbGetCatalog(id);
  if (!rec?.html) return false;
  const blob = new Blob([rec.html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    // popup blocked — تنزيل بدلًا من ذلك
    const a = document.createElement('a');
    a.href = url;
    a.download = rec.fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
