import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import { createProductRateLimit } from '../../middlewares/rateLimit.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const productsRouter = Router();

// Public
productsRouter.get('/', CACHE.SHORT, productsController.getProducts);
// Registered before /:id so "me" is never swallowed as an :id param.
productsRouter.get('/me', authenticate, CACHE.NONE, productsController.getMyProducts);
productsRouter.get('/:id', CACHE.MEDIUM, productsController.getProductById);

// Protected — owner-only, enforced in products.service.ts
productsRouter.post(
  '/',
  authenticate,
  createProductRateLimit,
  uploadMultipleMiddleware,
  productsController.createProduct
);
productsRouter.patch('/:id', authenticate, productsController.updateProduct);
productsRouter.delete('/:id', authenticate, productsController.deleteProduct);
