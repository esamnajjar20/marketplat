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
// EPIC 1.2: registered before /:id so "admin" is never swallowed as an
// :id param — same convention noted in service-listings.routes.ts's /me
// route. CACHE.NONE since this always needs the live, uncached state
// (see service-categories.service.ts's getServiceCategoriesForAdmin).
serviceCategoriesRouter.get(
  '/admin/all',
  authenticate,
  requireAdmin,
  CACHE.NONE,
  serviceCategoriesController.getServiceCategoriesForAdmin
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
