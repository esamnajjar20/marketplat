/**
 * Blocked users types — maps to backend's /api/v1/blocked-users module.
 * Verified against blocked-users.repository.ts's UserBlockWithBlockedUser
 * and blocked-users.service.ts's toggleBlock return shape.
 */

export interface BlockedUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** GET /blocked-users row shape — each block record includes the
 * blocked user's basic info, so "manage blocked users" can render
 * names/avatars directly with no extra fetch per row. */
export interface UserBlockWithBlockedUser {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  blocked: BlockedUserSummary;
}

/** POST /blocked-users/:userId — toggles; response tells you which way it went. */
export interface ToggleUserBlockResult {
  action: 'blocked' | 'unblocked';
}

export interface BlockedUsersQuery {
  page?: number;
  limit?: number;
}
