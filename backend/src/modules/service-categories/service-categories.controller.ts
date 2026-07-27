import { Request, Response, NextFunction } from 'express';
import { serviceCategoriesService } from './service-categories.service';
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  serviceCategoryIdSchema,
} from './service-categories.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const serviceCategoriesController = {
  createServiceCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = createServiceCategorySchema.parse({ body: req.body });
      const category = await serviceCategoriesService.createServiceCategory(body);
      res.status(201).json(successResponse('Service category created', category));
    } catch (error) {
      next(error);
    }
  },

  getServiceCategories: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await serviceCategoriesService.getServiceCategories();
      res.status(200).json(successResponse('Service categories fetched', categories));
    } catch (error) {
      next(error);
    }
  },

  getServiceCategoryById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = serviceCategoryIdSchema.parse({ params: req.params });
      const category = await serviceCategoriesService.getServiceCategoryById(params.id);
      res.status(200).json(successResponse('Service category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  getServiceCategoryBySlug: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      const category = await serviceCategoriesService.getServiceCategoryBySlug(slug);
      res.status(200).json(successResponse('Service category fetched', category));
    } catch (error) {
      next(error);
    }
  },

  updateServiceCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateServiceCategorySchema.parse({
        params: req.params,
        body: req.body,
      });
      const category = await serviceCategoriesService.updateServiceCategory(params.id, body);
      res.status(200).json(successResponse('Service category updated', category));
    } catch (error) {
      next(error);
    }
  },

  deleteServiceCategory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = serviceCategoryIdSchema.parse({ params: req.params });
      await serviceCategoriesService.deleteServiceCategory(params.id);
      res.status(200).json(successResponse('Service category deleted'));
    } catch (error) {
      next(error);
    }
  },
};
