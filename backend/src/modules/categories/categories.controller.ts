import { Request, Response, NextFunction } from 'express';
import { categoriesService } from './categories.service';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
} from './categories.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const categoriesController = {
  createCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = createCategorySchema.parse({ body: req.body });
      const category = await categoriesService.createCategory(body);
      res.status(201).json(successResponse('Category created', category));
    } catch (error) {
      next(error);
    }
  },

  getCategories: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await categoriesService.getCategories();
      res.status(200).json(successResponse('Categories fetched', categories));
    } catch (error) {
      next(error);
    }
  },

  getCategoryById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = categoryIdSchema.parse({ params: req.params });
      const category = await categoriesService.getCategoryById(params.id);
      res.status(200).json(successResponse('Category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  getCategoryBySlug: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      const category = await categoriesService.getCategoryBySlug(slug);
      res.status(200).json(successResponse('Category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  updateCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateCategorySchema.parse({ params: req.params, body: req.body });
      const category = await categoriesService.updateCategory(params.id, body);
      res.status(200).json(successResponse('Category updated', category));
    } catch (error) {
      next(error);
    }
  },

  deleteCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = categoryIdSchema.parse({ params: req.params });
      await categoriesService.deleteCategory(params.id);
      res.status(200).json(successResponse('Category deleted'));
    } catch (error) {
      next(error);
    }
  },
};
