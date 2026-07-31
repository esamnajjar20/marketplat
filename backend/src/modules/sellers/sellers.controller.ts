import { Request, Response, NextFunction } from 'express';
import { sellersService } from './sellers.service';
import {
  createSellerProfileSchema,
  sellerIdSchema,
  createRatingSchema,
  verifySellerSchema,
  suspendSellerSchema,
  adminGetSellersSchema,
} from './sellers.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const sellersController = {
  createSellerProfile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createSellerProfileSchema.parse({ body: req.body });
      const profile = await sellersService.createSellerProfile(user.userId, body);
      res.status(201).json(successResponse('Seller profile created', profile));
    } catch (error) {
      next(error);
    }
  },

  getMySellerProfile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const profile = await sellersService.getMySellerProfile(user.userId);
      res.status(200).json(successResponse('Seller profile fetched', profile));
    } catch (error) {
      next(error);
    }
  },

  getPublicSellerProfile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = sellerIdSchema.parse({ params: req.params });
      const profile = await sellersService.getPublicSellerProfile(params.id);
      res.status(200).json(successResponse('Seller profile fetched', profile));
    } catch (error) {
      next(error);
    }
  },

  createRating: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = createRatingSchema.parse({ params: req.params, body: req.body });
      await sellersService.createRating(params.id, user.userId, body);
      res.status(201).json(successResponse('Rating submitted'));
    } catch (error) {
      next(error);
    }
  },

  // EPIC 1.1: GET /admin/sellers — was entirely missing; there was no
  // way for an admin to even discover a sellerProfileId to pass into
  // verifySeller/suspendSeller below.
  getAllSellers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetSellersSchema.parse({ query: req.query });
      const result = await sellersService.getAllSellers(query);
      res
        .status(200)
        .json(successResponse('Sellers fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  verifySeller: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params, body } = verifySellerSchema.parse({ params: req.params, body: req.body });
      const profile = await sellersService.setVerification(params.id, body.verified, admin.userId);
      res.status(200).json(successResponse('Seller verification updated', profile));
    } catch (error) {
      next(error);
    }
  },

  // AUDIT-FIX: admin-only — answers "how do we remove seller status?".
  // Mirrors verifySeller exactly; wired the same way in admin.routes.ts
  // (behind adminRouter.use(authenticate, requireAdmin)).
  suspendSeller: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params, body } = suspendSellerSchema.parse({ params: req.params, body: req.body });
      const profile = await sellersService.setSuspension(params.id, body.suspended, admin.userId);
      res.status(200).json(successResponse('Seller suspension updated', profile));
    } catch (error) {
      next(error);
    }
  },
};
