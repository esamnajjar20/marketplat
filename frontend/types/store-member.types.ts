/**
 * Store Members types — maps to backend StoreMember model +
 * store-members.service / repository responses.
 */

export type StoreMemberRole = 'MANAGER' | 'STAFF' | 'EDITOR';
export type StoreMemberStatus = 'PENDING' | 'ACTIVE' | 'REMOVED';

export interface StoreMemberUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  city: string | null;
}

export interface StoreMemberInviter {
  id: string;
  name: string;
}

/** Nested store summary on pending-invite responses. */
export interface StoreMemberStoreSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface StoreMember {
  id: string;
  storeId: string;
  userId: string;
  role: StoreMemberRole;
  status: StoreMemberStatus;
  invitedById: string;
  invitedAt: string;
  acceptedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: StoreMemberUser;
  invitedBy: StoreMemberInviter;
  /** Present on listMyPendingInvites only */
  store?: StoreMemberStoreSummary;
}

export interface InviteStoreMemberPayload {
  email: string;
  role: StoreMemberRole;
}

export interface UpdateStoreMemberRolePayload {
  role: StoreMemberRole;
}

export interface ListStoreMembersQuery {
  page?: number;
  limit?: number;
  status?: StoreMemberStatus;
}
