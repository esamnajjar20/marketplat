import { Router } from 'express';
import { categoriesController } from './categories.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const categoriesRouter = Router();

categoriesRouter.get('/', CACHE.LONG, categoriesController.getCategories); // 1h — rarely changes
categoriesRouter.get('/slug/:slug', CACHE.LONG, categoriesController.getCategoryBySlug);
// FIX ADMIN-CATEGORIES-FRESH-01: registered before /:id so "admin" is
// never swallowed as an :id param — same convention as
// service-categories.routes.ts and product-categories.routes.ts.
// CACHE.NONE since this always needs the live, uncached state (see
// service's getCategoriesForAdmin comment for the full rationale).
categoriesRouter.get(
  '/admin/all',
  authenticate,
  requireAdmin,
  CACHE.NONE,
  categoriesController.getCategoriesForAdmin,
);
categoriesRouter.get('/:id', CACHE.LONG, categoriesController.getCategoryById);
categoriesRouter.post('/', authenticate, requireAdmin, categoriesController.createCategory);
categoriesRouter.patch('/:id', authenticate, requireAdmin, categoriesController.updateCategory);
categoriesRouter.delete('/:id', authenticate, requireAdmin, categoriesController.deleteCategory);
