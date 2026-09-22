import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { ROLE_RANK, Role, isAdminTier } from '../shared/constants/roles';

/**
 * requireAdmin — unchanged behavior, kept for existing call sites that
 * genuinely mean "ADMIN or above" today (the ones migrated to
 * requireMinRole(ROLES.MODERATOR) below now accept MODERATOR too).
 * ROLE_RANK-based comparison rather than a strict `=== ROLES.ADMIN`
 * check so SUPER_ADMIN — which must be able to do everything ADMIN can
 * — isn't accidentally locked out of routes still gated by this
 * function specifically.
 */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  const role = req.user?.role;
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_RANK, role) || ROLE_RANK[role as Role] < ROLE_RANK.ADMIN) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
};

/**
 * Gap #20 (admin permission tiers): requireMinRole(ROLES.MODERATOR)
 * gates the moderation-only surface (reports/fraud/ads) to MODERATOR
 * and above; requireMinRole(ROLES.ADMIN) is equivalent to requireAdmin
 * above and gates the rest of the admin panel (sellers/stores/
 * categories/users/broadcast/audit-logs/analytics). Rank-based rather
 * than an allowlist of role names so SUPER_ADMIN automatically passes
 * every gate without needing to be listed everywhere.
 */
export const requireMinRole =
  (minRole: Role) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !Object.prototype.hasOwnProperty.call(ROLE_RANK, role) || ROLE_RANK[role as Role] < ROLE_RANK[minRole]) {
      return next(new ForbiddenError(`${minRole} access or higher required`));
    }
    next();
  };

/** Gate for "any admin-tier role" (MODERATOR/ADMIN/SUPER_ADMIN) — used
 * where a route has no finer-grained requirement than "logged in as
 * some kind of admin", e.g. a shared landing/summary endpoint. */
export const requireAnyAdminTier = (req: Request, _res: Response, next: NextFunction): void => {
  const role = req.user?.role;
  if (!role || !isAdminTier(role)) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
};
