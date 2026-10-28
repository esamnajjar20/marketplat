import { AppState } from 'react-native';
import { ApiError } from '@/api/client';
import { sendChatAudio, sendChatFile, sendChatImage, type ChatMessage } from './messaging.api';
import { acknowledgeChatMedia, deferChatMedia, discardRejectedChatMedia, listChatMediaOutbox, listDueChatMediaOutbox } from '@/storage/chat-media-outbox';

export type ChatMediaSyncSnapshot = { isOnline: boolean; token?: string | null; csrfToken?: string | null; ownerId?: string | null; signal?: AbortSignal };
export type ChatMediaSyncResult = { sent: Array<{ operationId: string; conversationId: string; message: ChatMessage }>; pending: number; stoppedReason: 'offline' | 'signed-out' | 'retry-scheduled' | 'rejected' | null };
let activeSync: Promise<ChatMediaSyncResult> | null = null;
export function syncChatMediaOutbox(snapshot: ChatMediaSyncSnapshot): Promise<ChatMediaSyncResult> {
  if (activeSync) return activeSync.then(() => syncChatMediaOutbox(snapshot));
  const work = runSync(snapshot).finally(() => { if (activeSync === work) activeSync = null; });
  activeSync = work;
  return work;
}
async function runSync(snapshot: ChatMediaSyncSnapshot): Promise<ChatMediaSyncResult> {
  const sent: ChatMediaSyncResult['sent'] = [];
  if (!snapshot.isOnline || AppState.currentState !== 'active') return { sent, pending: 0, stoppedReason: 'offline' };
  if (!snapshot.token?.trim() || !snapshot.ownerId?.trim()) return { sent, pending: 0, stoppedReason: 'signed-out' };
  const items = await listDueChatMediaOutbox(snapshot.ownerId);
  let stoppedReason: ChatMediaSyncResult['stoppedReason'] = null;
  for (const item of items) {
    if (snapshot.signal?.aborted) { stoppedReason = 'signed-out'; break; }
    if (AppState.currentState !== 'active') { stoppedReason = 'offline'; break; }
    try {
      const asset = { uri: item.uri, fileName: item.fileName, mimeType: item.mimeType };
      const message = item.kind === 'image'
        ? await sendChatImage(item.conversationId, asset, snapshot.token, snapshot.csrfToken, undefined, item.operationId, snapshot.signal)
        : item.kind === 'audio'
          ? await sendChatAudio(item.conversationId, asset, snapshot.token, snapshot.csrfToken, item.operationId, snapshot.signal)
          : await sendChatFile(item.conversationId, asset, snapshot.token, snapshot.csrfToken, item.operationId, snapshot.signal);
      await acknowledgeChatMedia(item.operationId, snapshot.ownerId);
      sent.push({ operationId: item.operationId, conversationId: item.conversationId, message });
    } catch (error) {
      if (snapshot.signal?.aborted) { stoppedReason = 'signed-out'; break; }
      // Permanent server rejection — discard so the queue doesn't loop forever.
      if (error instanceof ApiError && error.status && [400, 404, 422].includes(error.status)) {
        await discardRejectedChatMedia(item.operationId, snapshot.ownerId);
        stoppedReason = 'rejected';
        break;
      }
      await deferChatMedia(item.operationId, snapshot.ownerId, error);
      stoppedReason = error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'signed-out' : 'retry-scheduled';
      break;
    }
  }
  return { sent, pending: (await listChatMediaOutbox(snapshot.ownerId)).length, stoppedReason };
}
