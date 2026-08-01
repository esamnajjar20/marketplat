import { Router } from 'express';
import { productCategoriesController } from './product-categories.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const productCategoriesRouter = Router();

productCategoriesRouter.get('/', CACHE.LONG, productCategoriesController.getProductCategories);
productCategoriesRouter.get(
  '/slug/:slug',
  CACHE.LONG,
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
productCategoriesRouter.get('/:id', CACHE.LONG, productCategoriesController.getProductCategoryById);
productCategoriesRouter.post(
  '/',
  authenticate,
  requireAdmin,
  productCategoriesController.createProductCategory
);
productCategoriesRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  productCategoriesController.updateProductCategory
);
productCategoriesRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  productCategoriesController.deleteProductCategory
);
