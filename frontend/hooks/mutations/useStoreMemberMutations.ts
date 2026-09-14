'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { storeMembersApi } from '@/api/store-members.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import type {
  InviteStoreMemberPayload,
  UpdateStoreMemberRolePayload,
} from '@/types/store-member.types';

export function useInviteStoreMember(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: InviteStoreMemberPayload) =>
      storeMembersApi.invite(storeId, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.members(storeId) });
      toast.success('تم إرسال الدعوة');
    },
    onError: toastMutationError,
  });
}

export function useUpdateStoreMemberRole(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      payload,
    }: {
      memberId: string;
      payload: UpdateStoreMemberRolePayload;
    }) => storeMembersApi.updateRole(storeId, memberId, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.members(storeId) });
      toast.success('تم تحديث الدور');
    },
    onError: toastMutationError,
  });
}

export function useRemoveStoreMember(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      storeMembersApi.remove(storeId, memberId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.members(storeId) });
      toast.success('تم إزالة العضو');
    },
    onError: toastMutationError,
  });
}

export function useAcceptStoreMemberInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      storeMembersApi.acceptInvite(memberId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.memberInvites() });
      // Team lists for any store may change
      queryClient.invalidateQueries({ queryKey: queryKeys.stores.all() });
      toast.success('تم قبول الدعوة');
    },
    onError: toastMutationError,
  });
}
