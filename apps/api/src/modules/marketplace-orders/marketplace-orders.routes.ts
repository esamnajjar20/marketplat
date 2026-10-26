import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { createProductRateLimit } from '../../middlewares/rateLimit.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { marketplaceOrdersController } from './marketplace-orders.controller';

export const marketplaceOrdersRouter = Router();
marketplaceOrdersRouter.use(authenticate);
marketplaceOrdersRouter.post('/', createProductRateLimit, marketplaceOrdersController.create);
marketplaceOrdersRouter.get('/mine', CACHE.NONE, marketplaceOrdersController.listMine);
marketplaceOrdersRouter.get('/seller', CACHE.NONE, marketplaceOrdersController.listForStore);
marketplaceOrdersRouter.get('/:id', CACHE.NONE, marketplaceOrdersController.getById);
marketplaceOrdersRouter.patch('/:id/status', createProductRateLimit, marketplaceOrdersController.updateStatus);
