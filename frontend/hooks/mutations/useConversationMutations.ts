'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { toast } from 'sonner';
import { sendConversationMessage } from '@/lib/sendConversationMessage';
import type { SendMessagePayload, Message, ConversationListItem } from '@/types/conversation.types';
import type { PaginatedResponse } from '@/types/api.types';

export type SendMessageVariables = SendMessagePayload & { operationId?: string };

export { useStartConversation } from './useStartConversation';

/**
 * POST /conversations/:id/messages. Optimistically updates both the thread
 * and every cached conversation-list page so the latest-message preview and
 * ordering respond immediately, then reconciles or rolls back on completion.
 * The server refetch remains the source of truth.
 *
 * UX-FIX (perceived-latency): previously did nothing to the cache until
 * the request resolved, then invalidated — ChatWindow (reading from the
 * same cache) showed nothing at all for however long the round-trip
 * took, then the bubble "popped in" all at once. That gap is exactly
 * what a chat UI shouldn't have: the whole point of the read/sent/
 * delivered ticks ChatWindow already renders is to make sending feel
 * immediate. onMutate now writes a temporary optimistic Message
 * (client-generated id, no readAt) straight into every currently-
 * mounted `messages` query for this conversation — ChatWindow's own
 * scroll-to-bottom effect (keyed on message count) picks it up the
 * same way a real message would. onError rolls that specific cache
 * write back and restores the composer's text (MessageInput's onError
 * below) so a failed send doesn't silently lose what was typed.
 * onSuccess reconciles the optimistic row with the canonical POST response.
 * SSE updates other participants' caches, so no follow-up GET is needed.
 *
 * FEAT-OFFLINE-MSG: offline sends used to hit this exact onError path
 * too — sw.js's 202 {queued:true} becomes a rejected promise with
 * code:'OFFLINE_QUEUED' (client.ts's interceptor) — which rolled the
 * optimistic bubble straight back out of the UI and toasted an error,
 * even though the message genuinely was saved (to the SW's IndexedDB
 * queue) and will send automatically once back online. The bubble
 * disappearing while a "queued" toast played was actively misleading —
 * looked exactly like a failed send. Now: a queued rejection still
 * rolls back this hook's own ephemeral optimistic entry (no toast) —
 * but only because ChatWindow renders a durable replacement instead,
 * sourced from the SW's own queue via usePendingMessages(), which
 * survives page reloads and app restarts (the in-memory optimistic
 * entry here never would). A real failure (wrong network entirely,
 * validation, blocked user while still online) keeps the original
 * rollback + error toast behaviour unchanged.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(selectUser);

  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: ({ operationId, ...payload }: SendMessageVariables) =>
      sendConversationMessage(
        conversationId,
        { kind: 'text', payload },
        operationId,
      ),

    onMutate: async (payload) => {
      if (!currentUser) return;

      await queryClient.cancelQueries({
        queryKey: queryKeys.conversations.messagesRoot(conversationId),
      });

      const optimisticMessage: Message = {
        // FIX OPTIMISTIC-ID-COLLISION-01: append a short random
        // suffix so two messages sent in the same millisecond don't
        // collide on React key + optimistic entry lookups. The
        // previous `optimistic-${Date.now()}` was sufficient for a
        // single human user (sub-ms send rate is implausible) but
        // would break for a scripted send or a fast multi-message
        // paste-and-enter sequence.
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        senderId: currentUser.id,
        body: payload.body?.trim() || (payload.imageUrl ? '📷' : ''),
        imageUrl: payload.imageUrl ?? null,
        readAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      };

      // Every currently-mounted `messages` query for this conversation
      // (there's normally just one — ChatWindow's live page — but this
      // stays correct even if params ever differ) gets the optimistic
      // message appended, matching useMessages' own "oldest → newest"
      // ordering (it reverses the backend's newest-first response).
      const matches = queryClient.getQueriesData<PaginatedResponse<Message>>({
        queryKey: queryKeys.conversations.messagesRoot(conversationId),
      });

      const previousConversations = queryClient.getQueriesData<PaginatedResponse<ConversationListItem>>({
        queryKey: queryKeys.conversations.mineRoot(),
      });
      const sentAt = optimisticMessage.createdAt;

      // Update the preview and timestamp in cached list pages immediately.
      // The list component sorts by updatedAt (with pinned threads first), so
      // the active conversation naturally rises without a refetch flash.
      for (const [key, data] of previousConversations) {
        if (!data?.items?.some((item) => item.id === conversationId)) continue;
        queryClient.setQueryData<PaginatedResponse<ConversationListItem>>(key, {
          ...data,
          items: data.items.map((item) => item.id === conversationId
            ? { ...item, lastMessage: optimisticMessage, updatedAt: sentAt }
            : item),
        });
      }

      for (const [key, data] of matches) {
        if (!data) continue;
        queryClient.setQueryData<PaginatedResponse<Message>>(key, {
          ...data,
          items: [...data.items, optimisticMessage],
        });
      }

      return { previousConversations, optimisticId: optimisticMessage.id };
    },

    // FIX CHAT-OPTIMISTIC-SSE-DUP-01: replace the temp id with the server
    // message as soon as HTTP succeeds so SSE (same id) becomes a no-op
    // and we do not briefly show optimistic-* + real id side by side.
    onSuccess: (serverMessage, _payload, context) => {
      // FIX CHAT-OPTIMISTIC-SSE-DUP-03: React Query types the first
      // onSuccess arg as TData | undefined; bail if the server returned
      // nothing (the query-layer owns the fallback).
      if (!serverMessage) return;
      const optimisticId = context?.optimisticId;
      const sentAt = serverMessage.createdAt || new Date().toISOString();
      const listMatches = queryClient.getQueriesData<PaginatedResponse<ConversationListItem>>({
        queryKey: queryKeys.conversations.mineRoot(),
      });
      for (const [key, data] of listMatches) {
        if (!data?.items?.some((item) => item.id === conversationId)) continue;
        queryClient.setQueryData<PaginatedResponse<ConversationListItem>>(key, {
          ...data,
          items: data.items.map((item) => {
            if (item.id !== conversationId) return item;
            const currentPreview = item.lastMessage;
            // Two sends can resolve out of order. Never let an older response
            // replace a later optimistic send or a newer message already
            // delivered through SSE. The optimistic id identifies the send
            // whose response is currently being reconciled.
            if (
              currentPreview?.id.startsWith('optimistic-') &&
              currentPreview.id !== optimisticId
            ) return item;
            const currentPreviewTime = Date.parse(currentPreview?.createdAt ?? item.updatedAt);
            const serverPreviewTime = Date.parse(sentAt);
            if (
              Number.isFinite(currentPreviewTime) &&
              Number.isFinite(serverPreviewTime) &&
              serverPreviewTime < currentPreviewTime
            ) return item;
            return { ...item, lastMessage: serverMessage, updatedAt: sentAt };
          }),
        });
      }
      const matches = queryClient.getQueriesData<PaginatedResponse<Message>>({
        queryKey: queryKeys.conversations.messagesRoot(conversationId),
      });
      for (const [key, data] of matches) {
        if (!data?.items) continue;
        // FIX CHAT-OPTIMISTIC-SSE-DUP-02: drop ONLY the optimistic row.
        // If SSE already placed serverMessage (id present), keep its
        // fields (e.g. readAt) instead of overwriting with the raw HTTP
        // body; upsert only when SSE has not arrived yet.
        const withoutOptimistic = data.items.filter((m) => m.id !== optimisticId);
        const hasServerAlready = withoutOptimistic.some((m) => m.id === serverMessage.id);
        const items = hasServerAlready
          ? withoutOptimistic
          : [...withoutOptimistic, serverMessage].sort((left, right) => {
              const leftTime = Date.parse(left.createdAt);
              const rightTime = Date.parse(right.createdAt);
              if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
              return leftTime - rightTime;
            });
        queryClient.setQueryData<PaginatedResponse<Message>>(key, {
          ...data,
          items,
          meta:
            hasServerAlready || !data.meta
              ? data.meta
              : { ...data.meta, total: (data.meta.total ?? withoutOptimistic.length) + 1 },
        });
      }
    },

    onError: (err, _payload, context) => {
      const optimisticId = context?.optimisticId;
      if (optimisticId) {
        // Remove only this mutation's optimistic row from the latest cache.
        // Restoring a whole snapshot here can erase an SSE message/read-state
        // update that arrived after onMutate but before this request failed.
        const messageQueries = queryClient.getQueriesData<PaginatedResponse<Message>>({
          queryKey: queryKeys.conversations.messagesRoot(conversationId),
        });
        for (const [key] of messageQueries) {
          queryClient.setQueryData<PaginatedResponse<Message>>(key, (current) => {
            if (!current?.items?.some((message) => message.id === optimisticId)) return current;
            return {
              ...current,
              items: current.items.filter((message) => message.id !== optimisticId),
              meta: current.meta
                ? { ...current.meta, total: Math.max(0, (current.meta.total ?? current.items.length) - 1) }
                : current.meta,
            };
          });
        }

        // A previous snapshot may itself contain an optimistic message from
        // an earlier concurrent send. Restore that preview only while its row
        // still exists in the latest message cache; otherwise it was already
        // rolled back and must not be resurrected by this later failure.
        const latestMessageQueries = queryClient.getQueriesData<PaginatedResponse<Message>>({
          queryKey: queryKeys.conversations.messagesRoot(conversationId),
        });
        const latestMessages = latestMessageQueries.flatMap(([, data]) => data?.items ?? []);
        const latestStableMessage = latestMessages
          .filter((message) => !message.id.startsWith('optimistic-'))
          .reduce<Message | null>((latest, message) => {
            if (!latest) return message;
            const latestTime = Date.parse(latest.createdAt);
            const messageTime = Date.parse(message.createdAt);
            return Number.isFinite(messageTime) && (!Number.isFinite(latestTime) || messageTime > latestTime)
              ? message
              : latest;
          }, null);
        const listQueries = queryClient.getQueriesData<PaginatedResponse<ConversationListItem>>({
          queryKey: queryKeys.conversations.mineRoot(),
        });
        for (const [key] of listQueries) {
          const previousData = context?.previousConversations?.find(
            ([previousKey]) => JSON.stringify(previousKey) === JSON.stringify(key),
          )?.[1];
          const previousItem = previousData?.items?.find((item) => item.id === conversationId);
          const previousMessage = previousItem?.lastMessage;
          const stablePreviousMessage = previousMessage && !previousMessage.id.startsWith('optimistic-')
            ? previousMessage
            : null;
          const fallbackMessage = latestStableMessage ?? stablePreviousMessage;
          queryClient.setQueryData<PaginatedResponse<ConversationListItem>>(key, (current) => {
            if (!current?.items) return current;
            return {
              ...current,
              items: current.items.map((item) => {
                // If SSE or a later mutation already replaced our optimistic
                // preview, preserve it; only roll back our own still-current row.
                if (item.id !== conversationId || item.lastMessage?.id !== optimisticId) return item;
                return {
                  ...item,
                  lastMessage: fallbackMessage,
                  updatedAt: fallbackMessage?.createdAt ?? (stablePreviousMessage ? previousItem?.updatedAt : undefined) ?? item.updatedAt,
                };
              }),
            };
          });
        }
      }

      // A queued-offline rejection is not a user-visible send failure. The
      // queued row is represented by the service-worker queue UI.
      const parsed = parseApiError(err);
      if (parsed.queued) return;
      toast.error(parsed.message);
    },

  });
}

/**
 * DELETE /conversations/:id/messages/:messageId — soft-delete. Only
 * invalidates this thread's messages, not the conversation list: a
 * deleted message doesn't change updatedAt server-side (softDelete
 * doesn't touch the conversation row), so the list's ordering/preview
 * is unaffected — same "invalidate only what actually changed" idea as
 * every other mutation here.
 */
export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) =>
      conversationsApi.deleteMessage(conversationId, messageId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.messagesRoot(conversationId),
      });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** PATCH /conversations/:id/flags — pin or archive a thread. */
export function useSetConversationFlags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...flags
    }: {
      id: string;
      pinned?: boolean;
      archived?: boolean;
      mutedUntil?: string | null;
    }) => conversationsApi.setFlags(id, flags).then((r) => r.data.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
      if (variables?.id) queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(variables.id) });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useMessageMarkMutation(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, kind, active }: { messageId: string; kind: 'pin' | 'star'; active: boolean }) => {
      if (kind === 'pin') {
        if (active) return conversationsApi.pinMessage(conversationId, messageId);
        return conversationsApi.unpinMessage(conversationId, messageId);
      }
      if (active) return conversationsApi.starMessage(conversationId, messageId);
      return conversationsApi.unstarMessage(conversationId, messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.messagesRoot(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.media(conversationId) });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}


export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationsApi.deleteConversation(id).then((r) => r.data.data),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount() });
      toast.success('تم حذف المحادثة من محادثاتك');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
