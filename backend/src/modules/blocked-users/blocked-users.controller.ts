import { Request, Response, NextFunction } from 'express';
import { blockedUsersService } from './blocked-users.service';
import { blockedUserIdSchema, getBlockedUsersSchema } from './blocked-users.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const blockedUsersController = {
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
