/**
 * Store Members API — maps to backend /api/v1/stores/* member routes.
 * Merge these methods into stores.api.ts OR import this module from hooks.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  StoreMember,
  InviteStoreMemberPayload,
  UpdateStoreMemberRolePayload,
  ListStoreMembersQuery,
} from '@/types/store-member.types';

export const storeMembersApi = {
  /** GET /stores/:id/members — team list (owner or active member). */
  list: (storeId: string, params?: ListStoreMembersQuery) =>
    apiClient
      .get<ApiResponse<StoreMember[]>>(`/stores/${storeId}/members`, { params })
      .then((r) => unwrapPaginated<StoreMember>(r)),

  /** POST /stores/:id/members — invite by email. */
  invite: (storeId: string, payload: InviteStoreMemberPayload) =>
    apiClient.post<ApiResponse<StoreMember>>(`/stores/${storeId}/members`, payload),

  /** PATCH /stores/:id/members/:memberId — change role. */
  updateRole: (storeId: string, memberId: string, payload: UpdateStoreMemberRolePayload) =>
    apiClient.patch<ApiResponse<StoreMember>>(
      `/stores/${storeId}/members/${memberId}`,
      payload
    ),

  /** DELETE /stores/:id/members/:memberId — soft-remove / leave. */
  remove: (storeId: string, memberId: string) =>
    apiClient.delete<ApiResponse<null>>(`/stores/${storeId}/members/${memberId}`),

  /** GET /stores/me/member-invites — pending invites for the current user. */
  listMyPendingInvites: () =>
    apiClient.get<ApiResponse<StoreMember[]>>('/stores/me/member-invites'),

  /** POST /stores/me/member-invites/:memberId/accept */
  acceptInvite: (memberId: string) =>
    apiClient.post<ApiResponse<StoreMember>>(
      `/stores/me/member-invites/${memberId}/accept`
    ),
};
