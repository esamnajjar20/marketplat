import { Request, Response, NextFunction } from 'express';
import { serviceReviewsService } from './service-reviews.service';
import { createServiceReviewSchema, getServiceReviewsSchema } from './service-reviews.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const serviceReviewsController = {
  createReview: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createServiceReviewSchema.parse({ body: req.body });
      const review = await serviceReviewsService.createReview(user.userId, body);
      res.status(201).json(successResponse('Service review created', review));
    } catch (error) {
      next(error);
    }
  },

  getReviewsForSeller: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, query } = getServiceReviewsSchema.parse({
        params: req.params,
        query: req.query,
      });
      const result = await serviceReviewsService.getReviewsForSeller(
        params.sellerProfileId,
        query
      );
      res
        .status(200)
        .json(
          successResponse('Service reviews fetched', result.items, { pagination: result.meta })
        );
    } catch (error) {
      next(error);
    }
  },
};
