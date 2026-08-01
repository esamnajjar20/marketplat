'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
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
