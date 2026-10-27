import { AppState } from 'react-native';
import { ApiError } from '@/api/client';
import { sendMessage, type ChatMessage } from './messaging.api';
import { acknowledgeChatMessage, deferChatMessage, discardRejectedChatMessage, listChatMessagesForOwner, listDueChatMessages } from '@/storage/chat-message-outbox';

export type ChatOutboxSyncResult = { sent: Array<{ operationId: string; message: ChatMessage }>; pending: number; stoppedReason: 'offline' | 'signed-out' | 'retry-scheduled' | 'retry-limit' | null };
export type ChatOutboxSyncSnapshot = { isOnline: boolean; token?: string | null; csrfToken?: string | null; ownerId?: string | null; signal?: AbortSignal };
const listeners = new Set<(operationId: string, message: ChatMessage) => void>();
let activeSync: Promise<ChatOutboxSyncResult> | null = null;

export function subscribeChatOutboxSent(listener: (operationId: string, message: ChatMessage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncChatMessageOutbox(snapshot: ChatOutboxSyncSnapshot): Promise<ChatOutboxSyncResult> {
  if (activeSync) return activeSync.then(() => syncChatMessageOutbox(snapshot));
  const work = runSync(snapshot).finally(() => { if (activeSync === work) activeSync = null; });
  activeSync = work;
  return work;
}

async function runSync(snapshot: ChatOutboxSyncSnapshot): Promise<ChatOutboxSyncResult> {
  const sent: ChatOutboxSyncResult['sent'] = [];
  if (!snapshot.isOnline || AppState.currentState !== 'active') return { sent, pending: 0, stoppedReason: 'offline' };
  if (!snapshot.token?.trim() || !snapshot.ownerId?.trim()) return { sent, pending: 0, stoppedReason: 'signed-out' };
  const ownerId = snapshot.ownerId;
  const items = await listDueChatMessages(ownerId);
  let stoppedReason: ChatOutboxSyncResult['stoppedReason'] = null;
  
  for (const item of items) {
    if (snapshot.signal?.aborted) { stoppedReason = 'signed-out'; break; }
    if (AppState.currentState !== 'active') { stoppedReason = 'offline'; break; }
    try {
      const message = await sendMessage(item.conversationId, item.body, snapshot.token, snapshot.csrfToken, item.operationId, snapshot.signal);
      await acknowledgeChatMessage(item.operationId, ownerId);
      sent.push({ operationId: item.operationId, message });
      for (const listener of listeners) listener(item.operationId, message);
    } catch (error) {
      if (snapshot.signal?.aborted) { stoppedReason = 'signed-out'; break; }
      
      // 🟢 الإصلاح: إذا كان الخطأ من السيرفر (400, 404) فهذا يعني أن الرسالة مرفوضة ولا فائدة من إعادتها
      // يجب حذفها من الطابور بدلاً من إعادتها للأبد
      if (error instanceof ApiError && error.status && [400, 404, 422].includes(error.status)) {
        // Permanent server rejection — discard so the queue doesn't loop forever.
        await discardRejectedChatMessage(item.operationId, ownerId);
        stoppedReason = 'retry-limit';
        break;
      }

      // إذا كان خطأ شبكة أو سيرفر (500)، نؤجلها ونعيد المحاولة
      await deferChatMessage(item.operationId, ownerId, error);
      stoppedReason = error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'signed-out' : 'retry-scheduled';
      break;
    }
  }
  const remaining = await listChatMessagesForOwner(ownerId);
  return { sent, pending: remaining.length, stoppedReason };
}
