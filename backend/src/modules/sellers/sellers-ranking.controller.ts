import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sellersRankingService } from './sellers-ranking.service';
import { successResponse } from '../../shared/types/api-response.types';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

const querySchema = z.object({
  query: z.object({
    limit: optionalQueryNumber(z.number().int().min(1).max(50)).optional(),
  }),
});

export const sellersRankingController = {
  getTop: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = querySchema.parse({ query: req.query });
      const items = await sellersRankingService.getTop(query.limit ?? 20);
      res.status(200).json(successResponse('Seller ranking fetched', items));
    } catch (e) {
      next(e);
    }
  },
};
