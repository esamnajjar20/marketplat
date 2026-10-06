import { Router } from 'express';
import { serviceTypesController } from './service-types.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const serviceTypesRouter = Router();
serviceTypesRouter.get('/', CACHE.STATIC, serviceTypesController.getActive);
serviceTypesRouter.get('/admin/all', authenticate, requireAdmin, CACHE.NONE, serviceTypesController.getAllForAdmin);
serviceTypesRouter.post('/', authenticate, requireAdmin, serviceTypesController.create);
serviceTypesRouter.post('/fields', authenticate, requireAdmin, serviceTypesController.createField);
serviceTypesRouter.patch('/fields/:id', authenticate, requireAdmin, serviceTypesController.updateField);
serviceTypesRouter.patch('/:id', authenticate, requireAdmin, serviceTypesController.update);
serviceTypesRouter.delete('/fields/:id', authenticate, requireAdmin, serviceTypesController.deleteField);
