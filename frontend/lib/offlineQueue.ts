import { getActiveSW } from '@/lib/swReady';
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
  /** FIX AD-DRAFT-QUEUE-LINK-01 — موجود فقط لو الطلب حمل X-Offline-Op-Id. */
  operationId?: string | null;
  /** PHASE-4 */
  priority?: 'critical' | 'normal' | 'low';
}

interface RawQueueEntry {
  id: number;
  url: string;
  method: string;
  queuedAt: number;
  status?: QueuedRequestStatus;
  lastError?: { status: number; message?: string };
  operationId?: string | null;
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
  // FIX QUEUE-PERF-01: استخدام getQueuedRequestCounts (readonce ثم
  // filter) بدل استدعاء getAll مرتين في نفس التطبيق. هنا نحتاج فقط
  // الـ pending count — نستخدم نفس الدالة لتوحيد المنطق.
  try {
    const { pending } = await getQueuedRequestCounts();
    return pending;
  } catch {
    // FIX QUEUE-LOGGING-01: تسجيل الفشل للتشخيص.
    console.warn('[queue] getQueuedRequestCount failed');
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
  } catch (err) {
    // FIX QUEUE-LOGGING-01: تسجيل فشل قراءة الطابور.
    console.warn('[queue] getQueuedRequestCounts failed:', err);
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
      operationId: e.operationId ?? null,
    }))
    .sort((a, b) => a.queuedAt - b.queuedAt)
    // FIX QUEUE-UI-LIMIT: cap the list displayed in /offline at 20 —
    // sw.js's pruneFailedEntries keeps 50 max in IDB, but showing all
    // of them in the page is overkill and slows the UI. Users can
    // discard the visible ones and refresh to see more.
    .slice(0, 20);
}

/** يطلب من الـ SW إعادة محاولة عنصر بعينه فورًا (نفس بروتوكول
 * RETRY_QUEUE_ITEM الذي lib/offlineMessagesQueue.ts يستخدمه لرسائل
 * المحادثة — عام أصلًا بـ sw.js، هنا فقط لعناصر غير الرسائل). */
export async function retryFailedRequest(id: number): Promise<void> {
  // FIX QUEUE-ID-VALIDATION: تحقق من صحة id قبل الإرسال — id خاطئ (NaN،
  // سالب، غير صحيح) يجعل SW يحاول getQueuedEntry(id) ويفشل بصمت.
  if (!Number.isInteger(id) || id <= 0) {
    console.warn('[queue] retryFailedRequest: invalid id', id);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'RETRY_QUEUE_ITEM', id });
}

/** يحذف عنصرًا فاشلاً نهائيًا دون إعادة محاولة. */
export async function discardFailedRequest(id: number): Promise<void> {
  // FIX QUEUE-ID-VALIDATION: نفس التحقق كما في retryFailedRequest.
  if (!Number.isInteger(id) || id <= 0) {
    console.warn('[queue] discardFailedRequest: invalid id', id);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'DISCARD_QUEUE_ITEM', id });
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
/**
 * FIX REPLAY-RACE-01: throttle لمنع تشغيل replayQueue متوازياً.
 * OfflineBootstrap يستدعي هذه الدالة من 4 مسارات (mount، online،
 * visibilitychange، periodic). بدون throttle، عند عودة الاتصال
 * تصل 2-4 رسائل REPLAY_QUEUE_NOW لنفس اللحظة، فيشغّل SW
 * replayQueue() متعدداً بالتوازي — كل واحد يقرأ نفس العناصر قبل
 * حذفها → POSTs مكررة (تكرار إعلانات).
 *
 * 1500ms كافية لدمج أي انفجار من الاستدعاءات المتزامنة، وقصيرة
 * بما يكفي لعدم تعطيل أي replay يدوي لاحق.
 */
const REPLAY_THROTTLE_MS = 1500;
// FIX QUEUE-THROTTLE-PERSIST: استخدم sessionStorage بدل متغير في الذاكرة
// حتى يبقى الـ throttle فعالًا بعد reload في نفس التبويب. بعد reload،
// OfflineBootstrap يُشغّل 4 triggers بسرعة — بدون sessionStorage، كل
// واحد يمرّ لأن lastReplayAt يُصفّر عند reload.
const REPLAY_STORAGE_KEY = 'market-offline-last-replay';

function getLastReplayAt(): number {
  try {
    if (typeof sessionStorage === 'undefined') return 0;
    return Number(sessionStorage.getItem(REPLAY_STORAGE_KEY) || 0);
  } catch {
    return 0;
  }
}

function setLastReplayAt(value: number): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(REPLAY_STORAGE_KEY, String(value));
  } catch {
    // sessionStorage قد يكون محجوبًا في وضع التصفح المتخفي —
    // نتجاهل ونكمل بدون throttle.
  }
}

/**
 * FIX QUEUE-CLEAR-ON-LOGOUT: يحذف كل عناصر الطابور (market-offline-queue).
 * يُستدعى من authCleanup عند logout — بدونه، User B على نفس الجهاز يرى
 * عدد العمليات المعلّقة من User A (وفي أول replay → 401 من توكن A).
 *
 * يُرسل رسالة للـ SW (owner الفعلي للطابور) بدل الكتابة مباشرة — تفادياً
 * لتعارض محتمل مع replay جارٍ.
 */
async function clearQueueDirectly(): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('queue clear failed'));
    tx.onabort = () => reject(tx.error ?? new Error('queue clear aborted'));
  });
}

/**
 * Clears the queue and waits for the SW to finish. Logout/account-switch
 * cleanup must not merely enqueue a CLEAR_QUEUE message and continue: the
 * next user could otherwise start a replay before the old rows disappear.
 * A bounded direct-IDB fallback covers development/private contexts where no
 * active SW exists.
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) {
      await clearQueueDirectly();
      return;
    }
    const registration = await getActiveSW();
    const worker = registration?.active;
    if (!worker) {
      await clearQueueDirectly();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener('message', onMessage);
        window.clearTimeout(timeoutId);
        err ? reject(err) : resolve();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'QUEUE_CLEARED') finish();
        else if (event.data?.type === 'QUEUE_CLEAR_FAILED') {
          finish(new Error('Service Worker failed to clear offline queue'));
        }
      };
      const timeoutId = window.setTimeout(() => {
        finish(new Error('Service Worker queue clear timed out'));
      }, 5_000);
      navigator.serviceWorker.addEventListener('message', onMessage);
      try {
        worker.postMessage({ type: 'CLEAR_QUEUE' });
      } catch (err) {
        finish(err instanceof Error ? err : new Error('Unable to message Service Worker'));
      }
    });
  } catch (err) {
    // If the SW is unavailable or failed to acknowledge, remove the rows
    // directly. This is preferable to leaving another user's mutations on
    // disk after logout.
    try {
      await clearQueueDirectly();
    } catch (directErr) {
      console.warn('[queue] clearOfflineQueue failed:', err, directErr);
      throw directErr;
    }
  }
}

export async function requestQueueReplay(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const now = Date.now();
  if (now - getLastReplayAt() < REPLAY_THROTTLE_MS) return;
  setLastReplayAt(now);
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'REPLAY_QUEUE_NOW' });
}


/** تعارض مع السيرفر (409/412 أو خطأ عميل نهائي) — يحتاج قرار مستخدم لا إعادة عمياء. */
export function isConflictFailure(item: QueuedRequestSummary): boolean {
  const status = item.lastError?.status;
  if (status === 409 || status === 412) return true;
  // 422 validation, 403, 404, 410 — terminal client errors (CONFLICT-UX-01)
  if (status === 422 || status === 403 || status === 404 || status === 410) return true;
  return false;
}

export function describeQueueFailure(item: QueuedRequestSummary): string {
  const status = item.lastError?.status;
  const msg = item.lastError?.message;
  // Lazy import avoided — keep offlineQueue free of circular risk with conflictResolver
  // by inlining the same copy as conflictResolver defaults.
  if (status === 409 || status === 412) {
    return msg || 'تم تعديل هذا العنصر من مكان آخر — حدّث ثم أعد المحاولة';
  }
  if (status === 422) return msg || 'البيانات المرسلة غير مقبولة — راجع الحقول';
  if (status === 403) return msg || 'ليس لديك صلاحية لهذا الإجراء';
  if (status === 404) return msg || 'العنصر لم يعد موجودًا';
  if (status === 410) return msg || 'العنصر أُزيل نهائيًا';
  if (status === 429) return msg || 'محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة';
  if (status && status >= 500) return msg || 'خطأ في السيرفر — أعد المحاولة لاحقًا';
  if (status && status >= 400) return msg || `رُفض الطلب (${status})`;
  return msg || 'فشل غير معروف';
}

/** الإجراء المقترح لعنصر فاشل — متوافق مع ConflictInfo.primaryAction */
export function queueFailureAction(
  item: QueuedRequestSummary,
): 'retry' | 'discard' | 'edit' | 'none' {
  const status = item.lastError?.status;
  if (status === 422) return 'edit';
  if (status === 403) return 'none';
  if (status === 404 || status === 410) return 'discard';
  if (status === 409 || status === 412) return 'edit';
  if (status && status >= 500) return 'retry';
  if (status === 429) return 'retry';
  if (status && status >= 400) return 'discard';
  return 'retry';
}

/**
 * FIX OFFLINE-DRAFT-PUBLISH-01: معرّفات العمليات **المعلّقة** بالطابور فقط
 * (status !== failed). يُستخدم من offlineDraftPublisher لتجنّب إرسال مزدوج
 * بينما SW ما زال سيُعيد المحاولة تلقائيًا. عناصر failed لا تُحتسب —
 * الناشر من المسودة يمكنه تولّيها إن وُجدت publishFiles.
 */
export async function listQueuedOperationIds(): Promise<Set<string>> {
  try {
    const entries = await getAllEntries();
    const ids = new Set<string>();
    for (const e of entries) {
      if (e.operationId && e.status !== 'failed') ids.add(e.operationId);
    }
    return ids;
  } catch (err) {
    console.warn('[queue] listQueuedOperationIds failed:', err);
    return new Set();
  }
}

/**
 * FIX STALE-QUEUE-HANDOFF-01: same shape as listQueuedOperationIds, but
 * carries each operationId's queuedAt timestamp instead of discarding
 * it. offlineDraftPublisher uses this to distinguish "SW just accepted
 * this, give it a moment" from "SW has been sitting on this for ages
 * and clearly isn't going to send it" — the latter case falls through
 * to the Publisher, which sends from the local draft instead. Without
 * the age, a queued entry that the SW never actually processes (e.g.
 * any entry created under an earlier deployment where the SW did NOT
 * intercept cross-origin requests) would stay in the draft as
 * 'pending_sync' forever, with the UI honestly showing "1 pending" but
 * nothing ever happening.
 */
export async function listQueuedOperationsWithAge(): Promise<Map<string, number>> {
  try {
    const entries = await getAllEntries();
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.operationId && e.status !== 'failed' && typeof e.queuedAt === 'number') {
        map.set(e.operationId, e.queuedAt);
      }
    }
    return map;
  } catch (err) {
    console.warn('[queue] listQueuedOperationsWithAge failed:', err);
    return new Map();
  }
}
