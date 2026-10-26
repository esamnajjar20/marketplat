import { Request, Response, NextFunction } from 'express';
import { collectionsService } from './collections.service';
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdSchema,
  reorderCollectionsSchema,
  collectionProductParamsSchema,
  storeIdParamSchema,
} from './collections.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const collectionsController = {
  createCollection: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createCollectionSchema.parse({ body: req.body });
      const collection = await collectionsService.createCollection(user.userId, body);
      res.status(201).json(successResponse('Collection created', collection));
    } catch (error) {
      next(error);
    }
  },

  getMyCollections: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const collections = await collectionsService.getMyCollections(user.userId);
      res.status(200).json(successResponse('Collections fetched', collections));
    } catch (error) {
      next(error);
    }
  },

  getCollectionById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = collectionIdSchema.parse({ params: req.params });
      const collection = await collectionsService.getCollectionById(user.userId, params.id);
      res.status(200).json(successResponse('Collection fetched', collection));
    } catch (error) {
      next(error);
    }
  },

  updateCollection: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateCollectionSchema.parse({ params: req.params, body: req.body });
      const collection = await collectionsService.updateCollection(user.userId, params.id, body);
      res.status(200).json(successResponse('Collection updated', collection));
    } catch (error) {
      next(error);
    }
  },

  deleteCollection: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = collectionIdSchema.parse({ params: req.params });
      await collectionsService.deleteCollection(user.userId, params.id);
      res.status(200).json(successResponse('Collection deleted'));
    } catch (error) {
      next(error);
    }
  },

  reorderCollections: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = reorderCollectionsSchema.parse({ body: req.body });
      await collectionsService.reorderCollections(user.userId, body);
      res.status(200).json(successResponse('Collections reordered'));
    } catch (error) {
      next(error);
    }
  },

  addProduct: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = collectionProductParamsSchema.parse({ params: req.params });
      await collectionsService.addProduct(user.userId, params.id, params.productId);
      res.status(200).json(successResponse('Product added to collection'));
    } catch (error) {
      next(error);
    }
  },

  removeProduct: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = collectionProductParamsSchema.parse({ params: req.params });
      await collectionsService.removeProduct(user.userId, params.id, params.productId);
      res.status(200).json(successResponse('Product removed from collection'));
    } catch (error) {
      next(error);
    }
  },

  // --- Public ---

  getPublicCollections: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = storeIdParamSchema.parse({ params: req.params });
      const collections = await collectionsService.getPublicCollections(params.storeId);
      res.status(200).json(successResponse('Collections fetched', collections));
    } catch (error) {
      next(error);
    }
  },

  getPublicCollectionProducts: async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { params } = collectionIdSchema.parse({ params: req.params });
      const products = await collectionsService.getPublicCollectionProducts(params.id);
      res.status(200).json(successResponse('Products fetched', products));
    } catch (error) {
      next(error);
    }
  },
};
