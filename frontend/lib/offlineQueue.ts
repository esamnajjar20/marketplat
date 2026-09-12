/**
 * واجهة الصفحة (لا الـ Service Worker) لطابور الطلبات غير المرسلة.
 *
 * الطابور الفعلي (IndexedDB) يُدار من public/sw.js — هذا الملف يقرأ منه
 * فقط لعرض العدد للمستخدم، ويرسل رسائل للـ SW لتشغيل إعادة المحاولة
 * يدويًا في المتصفحات التي لا تدعم Background Sync API (خاصة iOS Safari،
 * وهو أمر مهم لأن جزءًا كبيرًا من المستخدمين على الهاتف قد يستخدمونه).
 *
 * DB_NAME/DB_VERSION/STORE_NAME يجب أن تبقى مطابقة تمامًا لما في sw.js.
 *
 * FIX QUEUE-COUNT-01: قبل هذا الإصلاح، getQueuedRequestCount كانت تُرجع
 * `store.count()` الخام — أي كل صف بالطابور بغض النظر عن status، بما فيها
 * عناصر status:'failed' (رُفضت نهائيًا بـ 4xx حسب sw.js's replayOne —
 * FIX CONFLICT-01 — وتبقى بالطابور عمدًا بانتظار قرار المستخدم، لا تُعاد
 * تلقائيًا أبدًا). النتيجة: شارة "N بالانتظار" ببقية التطبيق (BottomNav) ونص
 * "سيُرسل تلقائيًا عند عودة الاتصال" بصفحة /offline كانا يَعِدان بشيء غير
 * صحيح لأي عنصر فاشل ضمن N — لن يُرسل تلقائيًا أبدًا، بعكس ما يقوله النص
 * حرفيًا. الحل: getQueuedRequestCount ترجع الآن عدد "المعلّق فعلًا" فقط
 * (pending)، وgetQueuedRequestCounts الجديدة تُرجع pending/failed منفصلين
 * لأي واجهة تحتاج التمييز.
 *
 * أخطر من ذلك: عناصر failed غير الخاصة برسائل المحادثة (مثلًا إنشاء/تعديل
 * إعلان فشل بـ 4xx أثناء انقطاع) لم يكن لها أي واجهة عرض/حل إطلاقًا — فقط
 * رسائل المحادثة تملك واجهة "إعادة محاولة/حذف" مخصّصة (lib/offlineMessagesQueue.ts
 * + فقاعة الرسالة بالمحادثة). كانت تبقى بالطابور للأبد بصمت، تُحتسب خطأً
 * ضمن "بالانتظار"، ولا طريقة للمستخدم لرؤيتها أو حذفها. listFailedRequests/
 * retryFailedRequest/discardFailedRequest أدناه تُعيد استخدام نفس بروتوكول
 * RETRY_QUEUE_ITEM/DISCARD_QUEUE_ITEM العام أصلًا بـ sw.js (غير خاص
 * برسائل المحادثة رغم أن أول استخدام له كان لها) لتغطية أي طلب فاشل عام،
 * وتُستبعد عناصر رسائل المحادثة من هذه القائمة تحديدًا (isMessageSendUrl)
 * تفاديًا لتكرار نفس العنصر بواجهتين مختلفتين قد تتعارضان (فقاعة المحادثة
 * تبقى المصدر الوحيد لإدارة رسائلها).
 */

const DB_NAME = 'market-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

export type QueuedRequestStatus = 'pending' | 'failed';

export interface QueuedRequestSummary {
  id: number;
  url: string;
  method: string;
  queuedAt: number;
  status: QueuedRequestStatus;
  lastError?: { status: number; message?: string };
}

interface RawQueueEntry {
  id: number;
  url: string;
  method: string;
  queuedAt: number;
  status?: QueuedRequestStatus;
  lastError?: { status: number; message?: string };
}

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

async function getAllEntries(): Promise<RawQueueEntry[]> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** عنصر بلا status (تنسيق قديم) يُعامَل كـ pending — نفس افتراض sw.js. */
function isPending(entry: RawQueueEntry): boolean {
  return entry.status !== 'failed';
}

/**
 * عدد الطلبات "المعلّقة فعلًا" فقط (بانتظار عودة الاتصال) — يستبعد عناصر
 * status:'failed' التي لن تُعاد تلقائيًا أبدًا. هذا هو الرقم الصحيح لأي
 * شارة/نص يَعِد بإرسال تلقائي عند عودة الاتصال (انظر FIX QUEUE-COUNT-01 أعلاه).
 */
export async function getQueuedRequestCount(): Promise<number> {
  try {
    const entries = await getAllEntries();
    return entries.filter(isPending).length;
  } catch {
    return 0;
  }
}

/** نفس البيانات لكن pending/failed منفصلين — لواجهات تحتاج عرض الفرق
 * صراحة (صفحة /offline) بدل رقم واحد مضلِّل. */
export async function getQueuedRequestCounts(): Promise<{ pending: number; failed: number }> {
  try {
    const entries = await getAllEntries();
    let pending = 0;
    let failed = 0;
    for (const entry of entries) {
      if (isPending(entry)) pending += 1;
      else failed += 1;
    }
    return { pending, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/** مطابق لـ lib/offlineMessagesQueue.ts's isSendMessageUrl لكن بلا حاجة
 * لمعرف محادثة محدد — نسخة عامة لاستبعاد أي رسالة محادثة من القائمة
 * أدناه (لها بالفعل واجهة إعادة محاولة/حذف مخصّصة بفقاعة الرسالة نفسها،
 * وعرضها هنا أيضًا يعني نفس العنصر قابل للتحكم من مكانين قد يتعارضان). */
function isMessageSendUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /\/conversations\/[^/]+\/messages$/.test(pathname);
  } catch {
    return false;
  }
}

/**
 * الطلبات الفاشلة نهائيًا (status:'failed') من غير رسائل المحادثة — أي
 * عملية أخرى (إعلان، منتج، إلخ) رفضها الخادم بـ 4xx أثناء إعادة الإرسال
 * ولن تُعاد تلقائيًا أبدًا. قبل هذا الإصلاح لم يكن لهذه العناصر أي واجهة
 * عرض إطلاقًا — كانت تبقى بالطابور بصمت للأبد. الأقدم أولًا.
 */
export async function listFailedRequests(): Promise<QueuedRequestSummary[]> {
  let entries: RawQueueEntry[];
  try {
    entries = await getAllEntries();
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.status === 'failed' && !isMessageSendUrl(e.url))
    .map((e) => ({
      id: e.id,
      url: e.url,
      method: e.method,
      queuedAt: e.queuedAt,
      status: 'failed' as const,
      lastError: e.lastError,
    }))
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/** يطلب من الـ SW إعادة محاولة عنصر بعينه فورًا (نفس بروتوكول
 * RETRY_QUEUE_ITEM الذي lib/offlineMessagesQueue.ts يستخدمه لرسائل
 * المحادثة — عام أصلًا بـ sw.js، هنا فقط لعناصر غير الرسائل). */
export async function retryFailedRequest(id: number): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'RETRY_QUEUE_ITEM', id });
}

/** يحذف عنصرًا فاشلاً نهائيًا دون إعادة محاولة. */
export async function discardFailedRequest(id: number): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'DISCARD_QUEUE_ITEM', id });
}

/** أنواع رسائل الـ SW التي تعني "أعد قراءة الطابور" — نفس القائمة
 * المستخدمة بـ lib/offlineMessagesQueue.ts's QUEUE_MESSAGE_EVENT_TYPES،
 * معاد تصديرها هنا لتفادي استيراد ملف الرسائل من كود لا علاقة له
 * بالمحادثات (صفحة /offline). */
export const QUEUE_EVENT_TYPES = [
  'QUEUE_REPLAYED',
  'QUEUE_ITEM_SENT',
  'QUEUE_ITEM_FAILED',
  'QUEUE_ITEM_DISCARDED',
] as const;

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


/** تعارض مع السيرفر (عادة 409) — يحتاج قرار مستخدم لا إعادة عمياء. */
export function isConflictFailure(item: QueuedRequestSummary): boolean {
  const status = item.lastError?.status;
  return status === 409 || status === 412;
}

export function describeQueueFailure(item: QueuedRequestSummary): string {
  if (isConflictFailure(item)) {
    return 'تعارض مع نسخة السيرفر — راجع البيانات أو احذف الطلب';
  }
  if (item.lastError?.status && item.lastError.status >= 500) {
    return 'خطأ في السيرفر — يمكن إعادة المحاولة لاحقًا';
  }
  if (item.lastError?.status && item.lastError.status >= 400) {
    return item.lastError.message || `رُفض الطلب (${item.lastError.status})`;
  }
  return item.lastError?.message || 'فشل غير معروف';
}
