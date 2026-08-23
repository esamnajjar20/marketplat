import { Router } from 'express';
import { collectionsController } from './collections.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const collectionsRouter = Router();

// Public — storefront reads. Two segments each (/store/:storeId and
// /:id/products), so neither collides with the single-segment owner
// routes below regardless of registration order; kept first purely
// for readability (public-then-owner), same grouping products.routes.ts
// uses.
collectionsRouter.get('/store/:storeId', CACHE.SHORT, collectionsController.getPublicCollections);
collectionsRouter.get('/:id/products', CACHE.SHORT, collectionsController.getPublicCollectionProducts);

// Owner-only — enforced in collections.service.ts via
// requireOwnStoreForProducts/requireOwnCollection, same convention as
// promotions.routes.ts. /me and /reorder are single-segment literal
// paths and MUST be registered before the single-segment /:id routes
// below, or Express would swallow them as an :id value.
collectionsRouter.post('/', authenticate, collectionsController.createCollection);
collectionsRouter.get('/me', authenticate, collectionsController.getMyCollections);
collectionsRouter.patch('/reorder', authenticate, collectionsController.reorderCollections);

collectionsRouter.get('/:id', authenticate, collectionsController.getCollectionById);
collectionsRouter.patch('/:id', authenticate, collectionsController.updateCollection);
collectionsRouter.delete('/:id', authenticate, collectionsController.deleteCollection);

collectionsRouter.post(
  '/:id/products/:productId',
  authenticate,
  collectionsController.addProduct
);
collectionsRouter.delete(
  '/:id/products/:productId',
  authenticate,
  collectionsController.removeProduct
);
