import { Request } from 'express';
import { UnauthorizedError } from '../errors/UnauthorizedError';

/**
 * Extracts and validates req.user — throws UnauthorizedError if missing.
 * Eliminates the copy-pasted requireUser block in every controller.
 *
 * Usage:
 *   const user = requireUser(req);
 */
export const requireUser = (req: Request): NonNullable<typeof req.user> => {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
};
