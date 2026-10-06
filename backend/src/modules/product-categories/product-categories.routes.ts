import { Router } from 'express';
import { productCategoriesController } from './product-categories.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import {
  categoryMutationRateLimit,
  categoryDeleteRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const productCategoriesRouter = Router();

productCategoriesRouter.get('/', CACHE.STATIC, productCategoriesController.getProductCategories);
productCategoriesRouter.get(
  '/slug/:slug',
  CACHE.STATIC,
  productCategoriesController.getProductCategoryBySlug
);
// Registered before /:id so "admin" is never swallowed as an :id param —
// same convention as service-categories.routes.ts.
productCategoriesRouter.get(
  '/admin/all',
  authenticate,
  requireAdmin,
  CACHE.NONE,
  productCategoriesController.getProductCategoriesForAdmin
);
productCategoriesRouter.get('/:id', CACHE.STATIC, productCategoriesController.getProductCategoryById);
productCategoriesRouter.post(
  '/',
  authenticate,
  requireAdmin,
  categoryMutationRateLimit,
  productCategoriesController.createProductCategory
);
productCategoriesRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  categoryMutationRateLimit,
  productCategoriesController.updateProductCategory
);
productCategoriesRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  categoryDeleteRateLimit,
  productCategoriesController.deleteProductCategory
);
