'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { StartConversationPayload, SendMessagePayload } from '@/types/conversation.types';

/**
 * POST /conversations — SellerCard's "مراسلة البائع" button. Idempotent
 * server-side (startFromAd reuses an existing thread for the same ad),
 * so the caller can navigate straight to the returned conversation's id
 * either way — no need to distinguish "created" from "reopened" here.
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
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SendMessagePayload) =>
      conversationsApi.sendMessage(conversationId, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['conversations', 'detail', conversationId, 'messages'],
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
    },
    onError: (err) => toast.error(parseApiError(err).message),
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
