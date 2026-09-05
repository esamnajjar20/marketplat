import { Request, Response, NextFunction } from 'express';
import { adsRepublishService } from './ads-republish.service';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { z } from 'zod';

const republishParamsSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const adsRepublishController = {
  republish: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = republishParamsSchema.parse({ params: req.params });
      const ad = await adsRepublishService.republish(user.userId, params.id);
      res.status(201).json(successResponse('Ad republished', ad));
    } catch (error) {
      next(error);
    }
  },
};
