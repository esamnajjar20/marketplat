import { Router } from 'express';
import { serviceCategoriesController } from './service-categories.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const serviceCategoriesRouter = Router();

serviceCategoriesRouter.get('/', CACHE.LONG, serviceCategoriesController.getServiceCategories);
serviceCategoriesRouter.get(
  '/slug/:slug',
  CACHE.LONG,
  serviceCategoriesController.getServiceCategoryBySlug
);
serviceCategoriesRouter.get('/:id', CACHE.LONG, serviceCategoriesController.getServiceCategoryById);
serviceCategoriesRouter.post(
  '/',
  authenticate,
  requireAdmin,
  serviceCategoriesController.createServiceCategory
);
serviceCategoriesRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  serviceCategoriesController.updateServiceCategory
);
serviceCategoriesRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  serviceCategoriesController.deleteServiceCategory
);
