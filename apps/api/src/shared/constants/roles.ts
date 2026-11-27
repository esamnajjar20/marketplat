import { USER_ROLES, type UserRole, ROLE_RANK, isAdminTier } from '@marketplat/contracts';

/** Stable API import surface backed by the canonical shared role contract. */
export const ROLES = Object.freeze(
  Object.fromEntries(USER_ROLES.map(role => [role, role])) as Record<UserRole, UserRole>
);

export type Role = UserRole;
export { ROLE_RANK, isAdminTier };
