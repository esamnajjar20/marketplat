'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { parseApiError } from '@/lib/errorParser';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { toast } from 'sonner';
import type { StartConversationPayload, SendMessagePayload, Message } from '@/types/conversation.types';
import type { PaginatedResponse } from '@/types/api.types';

/**
 * POST /conversations — SellerCard's "مراسلة البائع" (adId) and
 * PublicProfileHeader's "مراسلة" (userId) both go through this same
 * mutation; the payload's shape picks which backend branch handles it
 * (startFromAd vs startFromUser). Idempotent server-side either way —
 * both branches reuse an existing thread instead of creating a
 * duplicate — so the caller can navigate straight to the returned
 * conversation's id without needing to distinguish "created" from
 * "reopened" here.
 */
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: StartConversationPayload) =>
      conversationsApi.start(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * POST /conversations/:id/messages. Invalidates both this thread's
 * messages and the conversation list (a new message bumps the thread's
 * updatedAt server-side, so the list's ordering changes too) — same
 * broad-invalidation shape as useRespondToServiceRequest.
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
 * onSettled still invalidates as before — the refetch it triggers
 * replaces the temporary id with the server's real one (and a real
 * readAt/deliveredAt going forward), so this is purely additive to the
 * existing flow, not a replacement for it.
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
    mutationFn: (payload: SendMessagePayload) =>
      conversationsApi.sendMessage(conversationId, payload).then((r) => r.data.data),

    onMutate: async (payload) => {
      if (!currentUser) return;

      await queryClient.cancelQueries({
        queryKey: ['conversations', 'detail', conversationId, 'messages'],
      });

      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: currentUser.id,
        body: payload.body,
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
        queryKey: ['conversations', 'detail', conversationId, 'messages'],
      });

      const previous = matches.map(([key, data]) => [key, data] as const);

      for (const [key, data] of matches) {
        if (!data) continue;
        queryClient.setQueryData<PaginatedResponse<Message>>(key, {
          ...data,
          items: [...data.items, optimisticMessage],
        });
      }

      return { previous, optimisticId: optimisticMessage.id };
    },

    onError: (err, _payload, context) => {
      // Roll back only the exact cache entries this mutation touched.
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      // FEAT-OFFLINE-MSG: a queued-offline rejection isn't a real failure —
      // see this hook's doc comment above. Skip the error toast; the
      // pending-send indicator ChatWindow now renders from the SW queue
      // (usePendingMessages) already communicates the state honestly.
      const parsed = parseApiError(err);
      if (parsed.queued) return;
      toast.error(parsed.message);
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['conversations', 'detail', conversationId, 'messages'],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
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
        queryKey: ['conversations', 'detail', conversationId, 'messages'],
      });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
