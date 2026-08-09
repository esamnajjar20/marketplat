import { Role, ROLE_RANK } from '../constants/roles';

/**
 * Gap #20 (admin permission tiers) — the single rule every role-change
 * request is checked against:
 *
 *   An actor can only manage (change the role of) a user who is
 *   STRICTLY below them in rank, and can only assign a role that is
 *   ALSO strictly below their own rank. Never equal, never above.
 *
 * This one rank comparison covers every case the product spec called
 * for, with no special-cased role names:
 *   - MODERATOR can never change any role (ROLE_RANK.MODERATOR is only
 *     1 above USER, so it could only ever target USER — but see
 *     canManageRole's actorRank > 1 gate below, which shuts this off
 *     entirely rather than relying on the arithmetic alone; being
 *     explicit here matters more than being clever, since a future
 *     rank insertion between USER and MODERATOR would silently break
 *     the arithmetic-only version).
 *   - ADMIN (rank 2) can target USER/MODERATOR (rank 0/1, both < 2)
 *     and assign USER or MODERATOR (both < 2) — i.e. USER<->MODERATOR
 *     changes only. ADMIN cannot touch another ADMIN or SUPER_ADMIN
 *     (rank 2/3, not < 2), and cannot assign ADMIN or SUPER_ADMIN
 *     (rank 2/3, not < 2).
 *   - SUPER_ADMIN (rank 3) can target USER/MODERATOR/ADMIN (all < 3)
 *     and assign any of USER/MODERATOR/ADMIN. SUPER_ADMIN itself is
 *     never an assignable target through this function (rank 3 is
 *     never < 3) — granting/revoking SUPER_ADMIN is deliberately kept
 *     outside any in-app endpoint; see admin.service.ts's changeRole
 *     doc comment.
 *   - Self-modification is always rejected regardless of rank — an
 *     actor is never "strictly below" themselves, but this is checked
 *     explicitly by the caller (changeRole) since this function has no
 *     way to know actor and target are the same user from ranks alone.
 */
export function canManageRole(actorRole: Role, targetCurrentRole: Role, targetNewRole: Role): boolean {
  const actorRank = ROLE_RANK[actorRole];
  const targetCurrentRank = ROLE_RANK[targetCurrentRole];
  const targetNewRank = ROLE_RANK[targetNewRole];

  // Explicit MODERATOR shutoff — see doc comment above for why this
  // isn't left to fall out of the arithmetic alone.
  if (actorRank < ROLE_RANK.ADMIN) return false;

  return targetCurrentRank < actorRank && targetNewRank < actorRank;
}
