import { USER_ROLES, type UserRole } from './domain';

/** Canonical role rank shared by API authorization policy and client affordances. */
export const ROLE_RANK: Readonly<Record<UserRole, number>> = Object.freeze({
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
});

/** A moderator or higher can access at least one admin surface. */
export function isAdminTier(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
    && ROLE_RANK[value as UserRole] >= ROLE_RANK.MODERATOR;
}

/**
 * UI and server policy predicate for role changes. The caller must separately
 * reject self-modification and enforce any operation-specific restrictions.
 * The backend remains authoritative because it invokes this same contract.
 */
export function canManageRole(
  actorRole: UserRole,
  targetCurrentRole: UserRole,
  targetNewRole: UserRole,
): boolean {
  const actorRank = ROLE_RANK[actorRole];
  if (actorRank < ROLE_RANK.ADMIN) return false;
  return ROLE_RANK[targetCurrentRole] < actorRank
    && ROLE_RANK[targetNewRole] < actorRank;
}
