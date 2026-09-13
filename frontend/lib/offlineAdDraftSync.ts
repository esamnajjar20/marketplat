/**
 * FIX AD-DRAFT-QUEUE-LINK-01: يربط رسائل طابور الـ SW الحقيقية
 * (QUEUE_ITEM_SENT / QUEUE_ITEM_FAILED / QUEUE_ITEM_DISCARDED) بمسودة
 * الإعلان المطابقة عبر operationId — بدونه، طابور الـ SW ومسودات
 * offlineAdDrafts.ts نظامان منفصلان لا يتزامنان أبدًا: مسودة تبقى
 * "بانتظار الرفع" للأبد حتى لو الإعلان نُشر فعليًا بالخلفية.
 *
 * يُستدعى مرة واحدة من PwaBootstrap.tsx (نفس نمط requestQueueReplay).
 */
import { markAdDraftByOperationId, deleteAdDraftByOperationId } from '@/lib/offlineAdDrafts';

interface QueueMessage {
  type: string;
  operationId?: string | null;
  status?: number;
  message?: string;
}

function isQueueMessage(data: unknown): data is QueueMessage {
  return Boolean(data) && typeof (data as { type?: unknown }).type === 'string';
}

async function handleMessage(data: QueueMessage): Promise<void> {
  if (!data.operationId) return; // رسائل غير مرتبطة بمسودة إعلان (رسائل محادثة، إلخ)

  if (data.type === 'QUEUE_ITEM_SENT') {
    await markAdDraftByOperationId(data.operationId, { status: 'synced' });
    return;
  }

  if (data.type === 'QUEUE_ITEM_FAILED') {
    await markAdDraftByOperationId(data.operationId, {
      status: 'failed',
      lastError: data.message || (data.status ? `رُفض الطلب (${data.status})` : undefined),
    });
    return;
  }

  if (data.type === 'QUEUE_ITEM_DISCARDED') {
    // المستخدم قرر صراحة عدم إعادة المحاولة (زر "حذف" بمركز المزامنة على
    // عنصر الطابور نفسه) — احذف المسودة المرتبطة أيضًا بدل تركها معلّقة
    // بلا أي عملية تدعمها بعد الآن.
    await deleteAdDraftByOperationId(data.operationId);
  }
}

let installed = false;

/** يثبّت المستمع مرة واحدة فقط لكل تحميل صفحة — استدعاء متكرر آمن. */
export function initAdDraftSync(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!isQueueMessage(event.data)) return;
    void handleMessage(event.data);
  });
}
