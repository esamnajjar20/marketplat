/**
 * FEAT-OFFLINE-MSG: واجهة الصفحة لرسائل المحادثة "المُصفّفة" (queued) في
 * نفس طابور IndexedDB العام الذي يديره public/sw.js (نفس القاعدة/المخزن
 * الذي يقرأ منه lib/offlineQueue.ts للعدّاد العام — هذا الملف يقرأ نفس
 * البيانات لكن يُخرجها كرسائل معروضة، مصفّاة على محادثة واحدة، مع تمييز
 * pending/failed بدل مجرد عدد).
 *
 * DB_NAME/DB_VERSION/STORE_NAME يجب أن تبقى مطابقة تمامًا لـ sw.js
 * و lib/offlineQueue.ts.
 *
 * لماذا هنا لا داخل offlineQueue.ts: ذاك الملف عام لكل أنواع الطلبات
 * المُصفّفة (إعلانات، منتجات، رسائل...) ولا يعرف شيئًا عن شكل جسم كل
 * نوع طلب. هذا الملف يعرف تحديدًا شكل POST /conversations/:id/messages
 * (JSON بسيط {body}) ليعيد بناء نص الرسالة المعروضة منه.
 */

const DB_NAME = 'market-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

export type QueuedMessageStatus = 'pending' | 'failed';

export interface QueuedMessageEntry {
  /** معرّف عنصر الطابور بحد ذاته (id بـ IndexedDB) — يُستخدم لإعادة
   * المحاولة/الحذف عبر postMessage للـ SW. */
  queueId: number;
  body: string;
  queuedAt: number;
  status: QueuedMessageStatus;
  lastError?: { status: number; message?: string };
}

interface RawQueueEntry {
  id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Blob | null;
  queuedAt: number;
  status?: QueuedMessageStatus;
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

async function getAllRawEntries(): Promise<RawQueueEntry[]> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** مسار POST الذي يُرسله conversations.api.ts's sendMessage — يُقارَن
 * بنهاية الـ pathname فقط (لا يفترض بادئة API_BASE_URL). */
function isSendMessageUrl(url: string, conversationId: string): boolean {
  try {
    const { pathname } = new URL(url);
    return pathname.endsWith(`/conversations/${conversationId}/messages`);
  } catch {
    return false;
  }
}

/**
 * كل الرسائل "المُصفّفة" (لم تصل للسيرفر بعد) لمحادثة بعينها — pending
 * (بانتظار الاتصال) وfailed (رُفضت نهائيًا، بانتظار قرار المستخدم) معًا،
 * الأقدم أولًا (queuedAt تصاعديًا) لتُعرض بترتيب الإرسال الصحيح.
 *
 * جسم الطلب مخزَّن كـ Blob (انظر sw.js's handleMutation — FIX
 * OFFLINE-ADS-01) لأن الطابور عام لكل أنواع الطلبات، بما فيها
 * multipart/form-data الثنائي؛ لرسالة نصية عادية (JSON) هذا مجرد Blob
 * بنص JSON عادي — .text() ثم JSON.parse يستعيده بأمان.
 */
export async function listQueuedMessages(conversationId: string): Promise<QueuedMessageEntry[]> {
  let raw: RawQueueEntry[];
  try {
    raw = await getAllRawEntries();
  } catch {
    return [];
  }

  const relevant = raw.filter(
    (entry) => entry.method?.toUpperCase() === 'POST' && isSendMessageUrl(entry.url, conversationId),
  );

  const parsed = await Promise.all(
    relevant.map(async (entry): Promise<QueuedMessageEntry | null> => {
      if (!entry.body) return null;
      try {
        const text = await entry.body.text();
        const payload = JSON.parse(text) as { body?: unknown };
        if (typeof payload.body !== 'string') return null;
        return {
          queueId: entry.id,
          body: payload.body,
          queuedAt: entry.queuedAt,
          status: entry.status === 'failed' ? 'failed' : 'pending',
          lastError: entry.lastError,
        };
      } catch {
        return null;
      }
    }),
  );

  return parsed
    .filter((m): m is QueuedMessageEntry => m !== null)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/** يطلب من الـ SW إعادة محاولة إرسال عنصر واحد بعينه فورًا (زر "إعادة
 * المحاولة" على فقاعة رسالة فشلت أو لا تزال بالانتظار). */
export async function retryQueuedMessage(queueId: number): Promise<void> {
  // FIX MSG-QUEUE-ID-VALIDATION: تحقق من صحة queueId قبل الإرسال.
  if (!Number.isInteger(queueId) || queueId <= 0) {
    console.warn('[messages-queue] retryQueuedMessage: invalid id', queueId);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'RETRY_QUEUE_ITEM', id: queueId });
}

/** يحذف عنصرًا فاشلاً نهائيًا من الطابور دون إعادة محاولة (زر "حذف"). */
export async function discardQueuedMessage(queueId: number): Promise<void> {
  // FIX MSG-QUEUE-ID-VALIDATION
  if (!Number.isInteger(queueId) || queueId <= 0) {
    console.warn('[messages-queue] discardQueuedMessage: invalid id', queueId);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'DISCARD_QUEUE_ITEM', id: queueId });
}

/** أنواع رسائل الـ SW التي تعني "أعد قراءة طابور هذه المحادثة" —
 * يستخدمها usePendingMessages للاشتراك، بدل تكرار نفس القائمة بكل مكان. */
export const QUEUE_MESSAGE_EVENT_TYPES = [
  'QUEUE_REPLAYED',
  'QUEUE_ITEM_SENT',
  'QUEUE_ITEM_FAILED',
  'QUEUE_ITEM_DISCARDED',
] as const;
