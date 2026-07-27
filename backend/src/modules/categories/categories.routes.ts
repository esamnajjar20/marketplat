import { Router } from 'express';
import { categoriesController } from './categories.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const categoriesRouter = Router();

categoriesRouter.get('/', CACHE.LONG, categoriesController.getCategories); // 1h — rarely changes
categoriesRouter.get('/slug/:slug', CACHE.LONG, categoriesController.getCategoryBySlug);
categoriesRouter.get('/:id', CACHE.LONG, categoriesController.getCategoryById);
categoriesRouter.post('/', authenticate, requireAdmin, categoriesController.createCategory);
categoriesRouter.patch('/:id', authenticate, requireAdmin, categoriesController.updateCategory);
categoriesRouter.delete('/:id', authenticate, requireAdmin, categoriesController.deleteCategory);
