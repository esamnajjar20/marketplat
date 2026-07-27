/**
 * واجهة الصفحة (لا الـ Service Worker) لطابور الطلبات غير المرسلة.
 *
 * الطابور الفعلي (IndexedDB) يُدار من public/sw.js — هذا الملف يقرأ منه
 * فقط لعرض العدد للمستخدم، ويرسل رسائل للـ SW لتشغيل إعادة المحاولة
 * يدويًا في المتصفحات التي لا تدعم Background Sync API (خاصة iOS Safari،
 * وهو أمر مهم لأن جزءًا كبيرًا من المستخدمين على الهاتف قد يستخدمونه).
 *
 * DB_NAME/DB_VERSION/STORE_NAME يجب أن تبقى مطابقة تمامًا لما في sw.js.
 */

const DB_NAME = 'market-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متاح في هذه البيئة'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** عدد الطلبات المعلّقة حاليًا في الطابور. */
export async function getQueuedRequestCount(): Promise<number> {
  try {
    const db = await openQueueDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * يطلب من الـ Service Worker إعادة محاولة إرسال كل الطلبات المعلّقة فورًا.
 * يُستدعى عند حدث 'online' في الصفحة كـ fallback للمتصفحات التي لا تدعم
 * Background Sync (الاعتماد فقط على `sync` event في sw.js غير كافٍ لها).
 */
export async function requestQueueReplay(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'REPLAY_QUEUE_NOW' });
}
