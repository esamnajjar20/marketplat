import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { ROLES } from '../shared/constants/roles';

export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.role !== ROLES.ADMIN) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
};
