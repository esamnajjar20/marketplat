import { Router } from 'express';
import { publicSalesStatsController } from './public-stats.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';
export const publicSalesStatsRouter = Router();
publicSalesStatsRouter.get('/:slug/stats', CACHE.SHORT, publicSalesStatsController.getStoreStats);
