import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import {
  createProductRateLimit,
  addProductImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';
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
// Gap #3 fix: closes the audit finding — mirrors ads.routes.ts's
// POST/DELETE /:id/images exactly (same middleware order: auth, rate
// limit, multer, then controller).
productsRouter.post(
  '/:id/images',
  authenticate,
  addProductImagesRateLimit,
  uploadMultipleMiddleware,
  productsController.addImages
);
productsRouter.delete('/:id/images', authenticate, productsController.removeImage);
productsRouter.delete('/:id', authenticate, productsController.deleteProduct);
