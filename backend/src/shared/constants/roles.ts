/**
 * Gap #20 (admin permission tiers): four roles in a strict hierarchy —
 * SUPER_ADMIN > ADMIN > MODERATOR > USER. ROLE_RANK is the single
 * source of truth every permission check and role-management check is
 * built on (see roleHierarchy.ts's canManageRole and
 * admin.middleware.ts's requireMinRole). Adding a role later means
 * adding one entry here — every check downstream is rank-based, not a
 * hardcoded list of role names.
 */
export const ROLES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = keyof typeof ROLES;

export const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** True if `role` is any of the three admin-tier roles (has access to
 * at least some part of the admin panel) — MODERATOR and above. */
export function isAdminTier(role: string): role is Role {
  return role in ROLE_RANK && ROLE_RANK[role as Role] >= ROLE_RANK.MODERATOR;
}
