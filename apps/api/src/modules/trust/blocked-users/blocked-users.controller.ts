import { Request, Response, NextFunction } from 'express';
import { blockedUsersService } from './blocked-users.service';
import { blockedUserIdSchema, getBlockedUsersSchema } from './blocked-users.validation';
import { successResponse } from '../../../shared/types/api-response.types';
import { requireUser } from '../../../shared/auth/requireUser';

export const blockedUsersController = {
  getStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = blockedUserIdSchema.parse({ params: req.params });
      const isBlockedByMe = await blockedUsersService.isBlockedBy(user.userId, params.userId);
      res.status(200).json(successResponse('Block status fetched', { isBlockedByMe }));
    } catch (error) {
      next(error);
    }
  },

  toggleBlock: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = blockedUserIdSchema.parse({ params: req.params });
      const result = await blockedUsersService.toggleBlock(user.userId, params.userId);
      res.status(200).json(successResponse('Block status updated', result));
    } catch (error) {
      next(error);
    }
  },

  unblock: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = blockedUserIdSchema.parse({ params: req.params });
      const result = await blockedUsersService.unblock(user.userId, params.userId);
      res.status(200).json(successResponse('User unblocked', result));
    } catch (error) {
      next(error);
    }
  },

  getMyBlockedUsers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getBlockedUsersSchema.parse({ query: req.query });
      const result = await blockedUsersService.getMyBlockedUsers(user.userId, query);
      res
        .status(200)
        .json(successResponse('Blocked users fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
