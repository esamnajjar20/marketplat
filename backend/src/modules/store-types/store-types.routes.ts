import { Router } from 'express';
import { storeTypesController } from './store-types.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const storeTypesRouter = Router();

storeTypesRouter.get('/', CACHE.LONG, storeTypesController.getActive);
