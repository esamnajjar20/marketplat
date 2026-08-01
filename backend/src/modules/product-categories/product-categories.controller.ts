import { Request, Response, NextFunction } from 'express';
import { productCategoriesService } from './product-categories.service';
import {
  createProductCategorySchema,
  updateProductCategorySchema,
  productCategoryIdSchema,
} from './product-categories.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const productCategoriesController = {
  createProductCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = createProductCategorySchema.parse({ body: req.body });
      const category = await productCategoriesService.createProductCategory(body);
      res.status(201).json(successResponse('Product category created', category));
    } catch (error) {
      next(error);
    }
  },

  getProductCategories: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await productCategoriesService.getProductCategories();
      res.status(200).json(successResponse('Product categories fetched', categories));
    } catch (error) {
      next(error);
    }
  },

  getProductCategoriesForAdmin: async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const categories = await productCategoriesService.getProductCategoriesForAdmin();
      res.status(200).json(successResponse('Product categories fetched', categories));
    } catch (error) {
      next(error);
    }
  },

  getProductCategoryById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = productCategoryIdSchema.parse({ params: req.params });
      const category = await productCategoriesService.getProductCategoryById(params.id);
      res.status(200).json(successResponse('Product category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  getProductCategoryBySlug: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      const category = await productCategoriesService.getProductCategoryBySlug(slug);
      res.status(200).json(successResponse('Product category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  updateProductCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateProductCategorySchema.parse({
        params: req.params,
        body: req.body,
      });
      const category = await productCategoriesService.updateProductCategory(params.id, body);
      res.status(200).json(successResponse('Product category updated', category));
    } catch (error) {
      next(error);
    }
  },

  deleteProductCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = productCategoryIdSchema.parse({ params: req.params });
      await productCategoriesService.deleteProductCategory(params.id);
      res.status(200).json(successResponse('Product category deleted'));
    } catch (error) {
      next(error);
    }
  },
};
