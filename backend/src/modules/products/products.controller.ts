import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';
import {
  createProductSchema,
  updateProductSchema,
  productIdSchema,
  getProductsSchema,
} from './products.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { z } from 'zod';

export const productsController = {
  createProduct: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createProductSchema.parse({ body: req.body });
      const files = (req.files as Express.Multer.File[]) || [];
      const product = await productsService.createProduct(user.userId, body, files);
      res.status(201).json(successResponse('Product created', product));
    } catch (error) {
      next(error);
    }
  },

  getMyProducts: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const query = paginationQuerySchema.parse(req.query);
      const result = await productsService.getMyProducts(user.userId, query);
      res
        .status(200)
        .json(successResponse('Products fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getProducts: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getProductsSchema.parse({ query: req.query });
      const result = await productsService.getProducts(query);
      res
        .status(200)
        .json(successResponse('Products fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getProductById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = productIdSchema.parse({ params: req.params });
      const product = await productsService.getProductById(params.id);
      res.status(200).json(successResponse('Product fetched', product));
    } catch (error) {
      next(error);
    }
  },

  updateProduct: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateProductSchema.parse({ params: req.params, body: req.body });
      const product = await productsService.updateProduct(user.userId, params.id, body);
      res.status(200).json(successResponse('Product updated', product));
    } catch (error) {
      next(error);
    }
  },

  deleteProduct: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = productIdSchema.parse({ params: req.params });
      await productsService.deleteProduct(user.userId, params.id);
      res.status(200).json(successResponse('Product deleted'));
    } catch (error) {
      next(error);
    }
  },

  // Gap #3 fix: mirrors adsController.addImages exactly.
  addImages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = productIdSchema.parse({ params: req.params });
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) throw new BadRequestError('No images provided');
      const product = await productsService.addImages(params.id, user.userId, files);
      res.status(200).json(successResponse('Images added', product));
    } catch (error) {
      next(error);
    }
  },

  // Gap #3 fix: mirrors adsController.removeImage exactly.
  removeImage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = productIdSchema.parse({ params: req.params });
      const { imageUrl } = z.object({ imageUrl: z.string().url() }).parse(req.body);
      const product = await productsService.removeImage(params.id, user.userId, imageUrl);
      res.status(200).json(successResponse('Image removed', product));
    } catch (error) {
      next(error);
    }
  },
};
