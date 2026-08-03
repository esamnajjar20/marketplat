import { Request, Response, NextFunction } from 'express';
import { storesService } from './stores.service';
import {
  createStoreSchema,
  updateStoreSchema,
  storeIdSchema,
  getStoresSchema,
  adminGetStoresSchema,
  updateStoreStatusSchema,
  createStoreReviewSchema,
  getStoreReviewsSchema,
} from './stores.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const storesController = {
  createStore: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createStoreSchema.parse({ body: req.body });
      const store = await storesService.createStore(user.userId, body);
      res.status(201).json(successResponse('Store created', store));
    } catch (error) {
      next(error);
    }
  },

  getMyStore: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const store = await storesService.getMyStore(user.userId);
      res.status(200).json(successResponse('Store fetched', store));
    } catch (error) {
      next(error);
    }
  },

  updateMyStore: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = updateStoreSchema.parse({ body: req.body });
      const store = await storesService.updateMyStore(user.userId, body);
      res.status(200).json(successResponse('Store updated', store));
    } catch (error) {
      next(error);
    }
  },

  getPublicStore: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = storeIdSchema.parse({ params: req.params });
      const store = await storesService.getPublicStore(params.id);
      res.status(200).json(successResponse('Store fetched', store));
    } catch (error) {
      next(error);
    }
  },

  getStores: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getStoresSchema.parse({ query: req.query });
      const { stores, meta } = await storesService.getStores(query);
      res.status(200).json(successResponse('Stores fetched', stores, { pagination: meta }));
    } catch (error) {
      next(error);
    }
  },

  // Admin directory — audit report issue #1: lists stores of any status
  // (PENDING/ACTIVE/BLOCKED) so an admin can find stores awaiting
  // approval. Mirrors sellersController.getAllSellers.
  getAllStores: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetStoresSchema.parse({ query: req.query });
      const result = await storesService.getAllStores(query);
      res
        .status(200)
        .json(successResponse('Stores fetched', result.stores, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  updateStoreStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params, body } = updateStoreStatusSchema.parse({
        params: req.params,
        body: req.body,
      });
      const store = await storesService.updateStoreStatus(params.id, body, admin.userId);
      res.status(200).json(successResponse('Store status updated', store));
    } catch (error) {
      next(error);
    }
  },

  toggleFollow: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = storeIdSchema.parse({ params: req.params });
      const result = await storesService.toggleFollow(user.userId, params.id);
      res.status(200).json(successResponse('Follow status updated', result));
    } catch (error) {
      next(error);
    }
  },

  getMyFollowedStores: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const query = paginationQuerySchema.parse(req.query);
      const result = await storesService.getMyFollowedStores(user.userId, query);
      res
        .status(200)
        .json(successResponse('Followed stores fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  createReview: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = createStoreReviewSchema.parse({
        params: req.params,
        body: req.body,
      });
      await storesService.createReview(user.userId, params.id, body);
      res.status(201).json(successResponse('Review submitted'));
    } catch (error) {
      next(error);
    }
  },

  getStoreReviews: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, query } = getStoreReviewsSchema.parse({
        params: req.params,
        query: req.query,
      });
      const result = await storesService.getStoreReviews(params.id, query);
      res
        .status(200)
        .json(successResponse('Store reviews fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
