'use client';

// Split out of useConversationMutations.ts so buttons that only START a
// conversation (MessageUserButtonGate, SellerCard, ...) don't pull the
// 18 KB send/delete/flag mutation code into their route bundle.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
import type { StartConversationPayload } from '@/types/conversation.types';
import { toastMutationError } from '@/lib/mutationFeedback';

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
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
    },
    onError: toastMutationError,
  });
}
