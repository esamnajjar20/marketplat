import { Request, Response, NextFunction } from 'express';
import { sellersService } from './sellers.service';
import {
  createSellerProfileSchema,
  updateSellerProfileSchema,
  sellerIdSchema,
  createRatingSchema,
  getSellerRatingsSchema,
  verifySellerSchema,
  suspendSellerSchema,
  adminGetSellersSchema,
  bulkVerifySellersSchema,
  bulkSuspendSellersSchema,
} from './sellers.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { runBulk } from '../../shared/utils/bulkRunner';

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

  updateMySellerProfile: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = updateSellerProfileSchema.parse({ body: req.body });
      const profile = await sellersService.updateMySellerProfile(user.userId, body);
      res.status(200).json(successResponse('Seller profile updated', profile));
    } catch (error) {
      next(error);
    }
  },

  getMyAttention: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const attention = await sellersService.getMyAttention(user.userId);
      res.status(200).json(successResponse('Seller attention fetched', attention));
    } catch (error) {
      next(error);
    }
  },

  // PLAN-P1-4: seller-facing counterpart to admin's verifySeller below.
  requestVerification: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const profile = await sellersService.requestSellerVerification(user.userId);
      res.status(200).json(successResponse('Verification request submitted', profile));
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

  // TRACK-AD-RATINGS-LIST: public — mirrors
  // service-reviews.controller.ts's getReviewsForSeller /
  // stores.controller.ts's getStoreReviews exactly (no requireUser,
  // same pagination-meta response shape).
  getSellerRatings: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, query } = getSellerRatingsSchema.parse({
        params: req.params,
        query: req.query,
      });
      const result = await sellersService.getSellerRatings(params.id, query);
      res
        .status(200)
        .json(successResponse('Seller ratings fetched', result.items, { pagination: result.meta }));
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
      const profile = await sellersService.setSuspension(params.id, body.suspended, admin.userId, body.reason);
      res.status(200).json(successResponse('Seller suspension updated', profile));
    } catch (error) {
      next(error);
    }
  },

  // BULK-ADMIN (item 17): calls sellersService.setVerification once
  // per id via runBulk — reuses its existing findById/NotFoundError
  // check and audit logging exactly as-is per id. See bulkRunner.ts's
  // doc comment for why the real service function (not a repository
  // updateMany) is the point.
  bulkVerifySellers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkVerifySellersSchema.parse({ body: req.body });
      const result = await runBulk(body.sellerProfileIds, (id) =>
        sellersService.setVerification(id, body.verified, admin.userId)
      );
      res.status(200).json(
        successResponse('Bulk seller verification update processed', result.updated, {
          updatedCount: result.updated.length,
          failed: result.failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  // Mirrors bulkVerifySellers exactly, for setSuspension.
  bulkSuspendSellers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkSuspendSellersSchema.parse({ body: req.body });
      // FIX BULK-SELLER-REASON-DROP: previously passed only
      // `body.suspended`, dropping body.reason. The bulk schema
      // requires reason for suspended=true (superRefine), and the
      // single-seller PATCH path already passes it — only the bulk
      // path diverged. Net effect: an admin suspending 100 sellers
      // with a clear reason saw it validate at the schema layer, then
      // vanish before the audit log. Same class of bug already fixed
      // on stores' bulk status update.
      const result = await runBulk(body.sellerProfileIds, (id) =>
        sellersService.setSuspension(id, body.suspended, admin.userId, body.reason)
      );
      res.status(200).json(
        successResponse('Bulk seller suspension update processed', result.updated, {
          updatedCount: result.updated.length,
          failed: result.failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },
};
