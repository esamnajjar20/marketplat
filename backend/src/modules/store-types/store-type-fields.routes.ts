import { Router } from 'express';
import { storeTypeFieldsController } from './store-type-fields.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const storeTypeFieldsRouter = Router();
storeTypeFieldsRouter.get('/:storeTypeId/fields', CACHE.MEDIUM, storeTypeFieldsController.getPublic);
