import { Request, Response, NextFunction } from 'express';
import { promotionsService } from './promotions.service';
import {
  createPromotionSchema,
  updatePromotionSchema,
  promotionIdSchema,
} from './promotions.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const promotionsController = {
  createPromotion: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createPromotionSchema.parse({ body: req.body });
      const promotion = await promotionsService.createPromotion(user.userId, body);
      res.status(201).json(successResponse('Promotion created', promotion));
    } catch (error) {
      next(error);
    }
  },

  // Store-scoped listing only — mirrors productsController.getMyProducts
  // (there is no public "browse all promotions" endpoint; promotions
  // reach the public surface through Product's effectivePrice fields
  // instead, see products.controller.ts).
  getMyPromotions: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const promotions = await promotionsService.getStorePromotions(user.userId);
      res.status(200).json(successResponse('Promotions fetched', promotions));
    } catch (error) {
      next(error);
    }
  },

  getPromotionById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = promotionIdSchema.parse({ params: req.params });
      const promotion = await promotionsService.getPromotionById(user.userId, params.id);
      res.status(200).json(successResponse('Promotion fetched', promotion));
    } catch (error) {
      next(error);
    }
  },

  updatePromotion: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updatePromotionSchema.parse({ params: req.params, body: req.body });
      const promotion = await promotionsService.updatePromotion(user.userId, params.id, body);
      res.status(200).json(successResponse('Promotion updated', promotion));
    } catch (error) {
      next(error);
    }
  },

  // DELETE cancels rather than hard-deletes (mirrors products'
  // softDelete) — a promotion's history (usageCount, past window) stays
  // queryable for the store owner even after it's pulled.
  cancelPromotion: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = promotionIdSchema.parse({ params: req.params });
      await promotionsService.cancelPromotion(user.userId, params.id);
      res.status(200).json(successResponse('Promotion cancelled'));
    } catch (error) {
      next(error);
    }
  },
};
