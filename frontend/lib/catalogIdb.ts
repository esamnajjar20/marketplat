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

/**
 * FIX CATALOG-IDB-SINGLETON: connection واحد يُعاد استخدامه — كان يُفتح
 * اتصال جديد لكل عملية، يتراكم. نُغلق تلقائياً بعد idle 30 ثانية.
 */
let dbPromise: Promise<IDBDatabase> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('IDB open failed'));
    };
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('storeId', 'storeId', { unique: false });
      }
    };
  });
  return dbPromise;
}

/** يُغلق الاتصال بعد 30s من عدم الاستخدام (يمنع التسريب دون إغلاق فوري). */
function scheduleClose(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(async () => {
    try {
      const db = await dbPromise;
      db?.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
    closeTimer = null;
  }, 30_000);
}

export async function idbPutCatalog(record: CatalogBlobRecord): Promise<void> {
  const db = await openDb();
  scheduleClose();
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
  scheduleClose();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as CatalogBlobRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteCatalog(id: string): Promise<void> {
  const db = await openDb();
  scheduleClose();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}

/** فتح الكتالوج في تبويب جديد من Blob (يعمل دون نت) */
export async function openCatalogOffline(id: string): Promise<boolean> {
  // FIX CATALOG-OPEN-CATCH: try/catch — أي فشل (IndexedDB, Blob, popup)
  // كان يُصعّد كـ unhandled rejection. الآن يُرجع false بأمان.
  try {
    const rec = await idbGetCatalog(id);
    if (!rec?.html) return false;
    const blob = new Blob([rec.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    // WINDOW-OPEN-NOOPENER-01: match the pattern ShareAdButton already
    // uses for every external open. The blob URL here is our own HTML
    // from IndexedDB, so the practical risk is small — but 'noopener'
    // costs nothing and removes the window.opener surface entirely
    // (a blob-URL document with XSS would otherwise be able to navigate
    // or read the parent). Defensive consistency, not a bug fix.
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      // popup blocked — تنزيل بدلًا من ذلك
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.fileName;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.warn('[catalog-idb] openCatalogOffline failed:', err);
    return false;
  }
}
