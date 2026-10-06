import { Router } from 'express';
import { publicSalesStatsController } from './public-stats.controller';
export const publicSalesStatsRouter = Router();
publicSalesStatsRouter.get('/:slug/stats', publicSalesStatsController.getStoreStats);
