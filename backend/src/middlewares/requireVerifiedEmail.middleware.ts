import { Request, Response, NextFunction } from 'express';
import { userCache } from '../shared/utils/userCache';
import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { requireUser } from '../shared/utils/requireUser';

/**
 * FIX FEAT-EMAIL-VERIFY: blocks the caller if their email is not yet
 * verified. Must be chained AFTER `authenticate` (which sets
 * req.user).
 *
 * Cache-first: reads userCache.getOrFetch(userId) instead of hitting
 * the DB on every gated request. Self-healing on the deploy boundary:
 * cache entries written before `emailVerified` was added to
 * `CachedUser` come back with the field undefined, which we interpret
 * as "stale, refetch once" rather than "not verified" — otherwise
 * every already-logged-in user would be blocked the moment this
 * deploys until their cache TTL (5min + jitter) elapses.
 *
 * Failure mode: if userCache returns null (Redis down, user deleted),
 * we let the request through rather than block — the caller is
 * already authenticated (else `authenticate` would have 401'd), and
 * failing closed here would turn a transient cache hiccup into a
 * full write-path outage. The gating is a "soft" business rule, not
 * a security boundary — the real security boundary is `authenticate`.
 *
 * 403 with code EMAIL_NOT_VERIFIED so the frontend can show a
 * targeted message / trigger the banner instead of a generic error.
 */
export const requireVerifiedEmail = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);

    let cached = await userCache.getOrFetch(user.userId);

    if (cached && cached.emailVerified === undefined) {
      // Stale shape from before the field existed — invalidate once and
      // refetch. Happens at most once per user per deploy.
      await userCache.invalidate(user.userId);
      cached = await userCache.getOrFetch(user.userId);
    }

    if (!cached) {
      // Couldn't read the cache — see failure-mode note above. The
      // caller is authenticated; do not turn this into a 403.
      next();
      return;
    }

    if (!cached.emailVerified) {
      next(
        new ForbiddenError(
          'يرجى تأكيد بريدك الإلكتروني لإتمام هذا الإجراء',
          'EMAIL_NOT_VERIFIED',
        ),
      );
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
};
