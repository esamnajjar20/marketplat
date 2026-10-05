import { getActiveSW } from '@/lib/swReady';
/**
 * FEAT-OFFLINE-MSG: واجهة الصفحة لرسائل المحادثة "المُصفّفة" (queued) في
 * نفس طابور IndexedDB العام الذي يديره public/sw.js (نفس القاعدة/المخزن
 * الذي يقرأ منه lib/offlineQueue.ts للعدّاد العام — هذا الملف يقرأ نفس
 * البيانات لكن يُخرجها كرسائل معروضة، مصفّاة على محادثة واحدة، مع تمييز
 * pending/failed/cancelled بدل مجرد عدد).
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

export type QueuedMessageStatus = 'pending' | 'failed' | 'cancelled';

export interface QueuedMessageEntry {
  queueId: number;
  body: string;
  hasImage?: boolean;
  hasAudio?: boolean;
  hasFile?: boolean;
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number;
  attachment?: { blob: Blob; name: string; mimeType: string; size: number; kind: 'image' | 'audio' | 'file' };
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
    const base = `/conversations/${conversationId}/messages`;
    // FIX CHAT-OFFLINE-IMG-QUEUE-01: include image uploads, not only JSON text.
    return pathname.endsWith(base) || pathname.endsWith(`${base}/image`) || pathname.endsWith(`${base}/audio`) || pathname.endsWith(`${base}/file`);
  } catch {
    return false;
  }
}

function isSendMessageImageUrl(url: string, conversationId: string): boolean {
  try { return new URL(url).pathname.endsWith(`/conversations/${conversationId}/messages/image`); } catch { return false; }
}

function isSendMessageAudioUrl(url: string, conversationId: string): boolean {
  try { return new URL(url).pathname.endsWith(`/conversations/${conversationId}/messages/audio`); } catch { return false; }
}

function isSendMessageFileUrl(url: string, conversationId: string): boolean {
  try { return new URL(url).pathname.endsWith(`/conversations/${conversationId}/messages/file`); } catch { return false; }
}

/**
 * Read the original multipart body from the SW queue. The body is a Blob,
 * so it survives reloads; Response.formData() reconstructs the File without
 * decoding binary bytes into text.
 */
async function readMultipartAttachment(entry: RawQueueEntry, kind: 'image' | 'audio' | 'file') {
  if (!entry.body) return undefined;
  try {
    const contentType = entry.headers?.['content-type'] || entry.headers?.['Content-Type'];
    if (!contentType?.toLowerCase().includes('multipart/form-data')) return undefined;
    const form = await new Response(entry.body, { headers: { 'content-type': contentType } }).formData();
    const field = kind === 'image' ? 'image' : kind === 'audio' ? 'audio' : 'file';
    const value = form.get(field);
    if (!(value instanceof File) || !value.size) return undefined;
    return {
      blob: value,
      name: value.name || `${kind}-${entry.id}`,
      mimeType: value.type || 'application/octet-stream',
      size: value.size,
      kind,
    } as const;
  } catch {
    return undefined;
  }
}

export async function listQueuedMessages(conversationId: string): Promise<QueuedMessageEntry[]> {
  let raw: RawQueueEntry[];
  try { raw = await getAllRawEntries(); } catch { return []; }

  const relevant = raw.filter(
    (entry) => entry.method?.toUpperCase() === 'POST' && isSendMessageUrl(entry.url, conversationId),
  );

  const parsed = await Promise.all(relevant.map(async (entry): Promise<QueuedMessageEntry | null> => {
    const status: QueuedMessageStatus = entry.status === 'failed'
      ? 'failed'
      : entry.status === 'cancelled' ? 'cancelled' : 'pending';
    const isImage = isSendMessageImageUrl(entry.url, conversationId);
    const isAudio = isSendMessageAudioUrl(entry.url, conversationId);
    const isFile = isSendMessageFileUrl(entry.url, conversationId);

    if (isImage || isAudio || isFile) {
      const kind = isImage ? 'image' : isAudio ? 'audio' : 'file';
      const attachment = await readMultipartAttachment(entry, kind);
      let caption = kind === 'audio' ? '🎤 رسالة صوتية' : kind === 'image' ? '📷' : '📎 ملف';
      if (entry.body && attachment) {
        try {
          const contentType = entry.headers?.['content-type'] || entry.headers?.['Content-Type'];
          const form = contentType?.toLowerCase().includes('multipart/form-data')
            ? await new Response(entry.body, { headers: { 'content-type': contentType } }).formData()
            : null;
          const text = form?.get('body');
          if (typeof text === 'string' && text.trim()) caption = text.trim().slice(0, 2000);
        } catch { /* placeholder is fine */ }
      }
      return {
        queueId: entry.id,
        body: caption,
        hasImage: isImage,
        hasAudio: isAudio,
        hasFile: isFile,
        fileName: attachment?.name,
        fileMimeType: attachment?.mimeType,
        fileSize: attachment?.size,
        attachment,
        queuedAt: entry.queuedAt,
        status,
        lastError: entry.lastError,
      };
    }

    if (!entry.body) return null;
    try {
      const text = await entry.body.text();
      const payload = JSON.parse(text) as { body?: unknown };
      if (typeof payload.body !== 'string') return null;
      return {
        queueId: entry.id,
        body: payload.body,
        hasImage: false,
        queuedAt: entry.queuedAt,
        status,
        lastError: entry.lastError,
      };
    } catch { return null; }
  }));

  return parsed.filter((m): m is QueuedMessageEntry => m !== null).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function retryQueuedMessage(queueId: number): Promise<void> {
  // FIX MSG-QUEUE-ID-VALIDATION: تحقق من صحة queueId قبل الإرسال.
  if (!Number.isInteger(queueId) || queueId <= 0) {
    console.warn('[messages-queue] retryQueuedMessage: invalid id', queueId);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'RETRY_QUEUE_ITEM', id: queueId });
}

/** يلغي الإرسال مع إبقاء الحمولة محليًا كرسالة ملغاة قابلة لإعادة المحاولة لاحقًا. */
export async function cancelQueuedMessage(queueId: number): Promise<void> {
  if (!Number.isInteger(queueId) || queueId <= 0) return;
  if (!('serviceWorker' in navigator)) return;
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'CANCEL_QUEUE_ITEM', id: queueId });
}

/** يحذف عنصرًا فاشلاً نهائيًا من الطابور دون إعادة محاولة (زر "حذف"). */
export async function discardQueuedMessage(queueId: number): Promise<void> {
  // FIX MSG-QUEUE-ID-VALIDATION
  if (!Number.isInteger(queueId) || queueId <= 0) {
    console.warn('[messages-queue] discardQueuedMessage: invalid id', queueId);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await getActiveSW();
  registration?.active?.postMessage({ type: 'DISCARD_QUEUE_ITEM', id: queueId });
}

/** أنواع رسائل الـ SW التي تعني "أعد قراءة طابور هذه المحادثة" —
 * يستخدمها usePendingMessages للاشتراك، بدل تكرار نفس القائمة بكل مكان. */
export const QUEUE_MESSAGE_EVENT_TYPES = [
  'QUEUE_REPLAYED',
  'QUEUE_ITEM_SENT',
  'QUEUE_ITEM_FAILED',
  'QUEUE_ITEM_DISCARDED',
  'QUEUE_ITEM_CANCELLED',
] as const;
