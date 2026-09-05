import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adsPinService } from './ads-pin.service';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

const schema = z.object({
  params: z.object({ id: z.string().cuid() }),
  body: z.object({ isPinned: z.boolean() }),
});

export const adsPinController = {
  setPinned: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = schema.parse({ params: req.params, body: req.body });
      const ad = await adsPinService.setPinned(user.userId, params.id, body.isPinned);
      res.status(200).json(
        successResponse(body.isPinned ? 'Ad pinned' : 'Ad unpinned', ad)
      );
    } catch (error) {
      next(error);
    }
  },
};
