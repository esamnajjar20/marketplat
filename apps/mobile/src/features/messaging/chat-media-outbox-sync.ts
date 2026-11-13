import { AppState } from 'react-native';
import { ApiError } from '@/api/client';
import { sendChatAudio, sendChatFile, sendChatImage, type ChatMessage } from './messaging.api';
import { persistCachedChatMessages } from '@/storage/chat-message-cache';
import { acknowledgeChatMedia, deferChatMedia, discardRejectedChatMedia, listChatMediaOutbox, listDueChatMediaOutbox } from '@/storage/chat-media-outbox';

export type ChatMediaSyncSnapshot = { isOnline: boolean; token?: string | null; csrfToken?: string | null; ownerId?: string | null; signal?: AbortSignal };
export type ChatMediaSyncResult = { sent: Array<{ operationId: string; conversationId: string; message: ChatMessage }>; pending: number; stoppedReason: 'offline' | 'signed-out' | 'retry-scheduled' | 'rejected' | null };
// After this many attempts a failing local cache write no longer blocks removal of an already-delivered attachment.
const CACHE_SAVE_RETRY_LIMIT = 3;
let activeSync: Promise<ChatMediaSyncResult> | null = null;
const listeners = new Set<(item: ChatMediaSyncResult['sent'][number]) => void>();

/** Notified for every attachment the server accepted, whichever surface (app-level bridge or an open
 *  conversation) triggered the sync, so a mounted chat screen can merge the delivered message. */
export function subscribeChatMediaOutboxSent(listener: (item: ChatMediaSyncResult['sent'][number]) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
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
      // Persist for offline reading (works with no conversation screen mounted) BEFORE the queue row and
      // file are removed, so a crash/SQLite failure can never leave neither a queue entry nor a local copy.
      // On failure the row is kept and retried: the server de-duplicates by operationId (24h window),
      // so the re-send returns the same message instead of creating a second one.
      try {
        // persistCachedChatMessages reports failure as a result (the best-effort cache writer
        // swallows SQLite errors and would make this retry path dead code). 'skipped' = nothing storable.
        const cacheResult = await persistCachedChatMessages(snapshot.ownerId, item.conversationId, [message]);
        if (cacheResult === 'failed') throw new Error('تعذر حفظ الرسالة في الكاش المحلي.');
      } catch (cacheError) {
        if (item.attempts < CACHE_SAVE_RETRY_LIMIT) {
          await deferChatMedia(item.operationId, snapshot.ownerId, cacheError);
          stoppedReason = 'retry-scheduled';
          break;
        }
        // Persistent local-cache failure: the message is safely on the server, so stop holding the
        // attachment in the queue forever; it reappears from the server on the next online fetch.
      }
      await acknowledgeChatMedia(item.operationId, snapshot.ownerId);
      const delivered = { operationId: item.operationId, conversationId: item.conversationId, message };
      sent.push(delivered);
      for (const listener of listeners) { try { listener(delivered); } catch { /* a faulty subscriber must not stall the queue */ } }
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
