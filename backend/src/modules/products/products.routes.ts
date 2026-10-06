import { Router } from 'express';
import { productsController } from './products.controller';
import { productsStockController } from './products-stock.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import {
  createProductRateLimit,
  addProductImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';
// PATCH/DELETE/reorder/stock-adjust had
// no rate limit at all — an authenticated owner (or a compromised
// session) could loop any of them arbitrarily (product churn,
// Cloudinary reorder spam, stock-flip spam). Reusing createProductRateLimit
// (40/hr) as the closest fitting bucket, same shape as ads.service.ts's
// mutation set. No new limiter definition needed.
const productMutationRateLimit = createProductRateLimit;
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const productsRouter = Router();

// Public
productsRouter.get('/', CACHE.SHORT, productsController.getProducts);
// Registered before /:id so "me" is never swallowed as an :id param.
productsRouter.get('/me', authenticate, CACHE.NONE, productsController.getMyProducts);
productsRouter.get('/:id', CACHE.MEDIUM, productsController.getProductById);

// Inventory reads are scoped to the caller's store by the service layer.
productsRouter.get('/stock/summary', authenticate, CACHE.NONE, productsStockController.getSummary);
productsRouter.get('/stock/history', authenticate, CACHE.NONE, productsStockController.getHistory);

// Protected — owner-only, enforced in products.service.ts
productsRouter.post(
  '/',
  authenticate, requireVerifiedEmail,
  createProductRateLimit,
  uploadMultipleMiddleware,
  productsController.createProduct
);
// PATCH/DELETE/stock/reorder did not
// require a verified email while POST / (create) and POST /:id/images
// did — an unverified user could edit or delete existing products but
// not create new ones, which reads as a broken UI rather than a
// verification prompt. Matched every mutating route in this router to
// the same gate.
productsRouter.patch(
  '/:id',
  authenticate,
  requireVerifiedEmail,
  productMutationRateLimit,
  productsController.updateProduct
);
// TRACK-INVENTORY: quick stock adjust (absolute quantity)
productsRouter.patch(
  '/:id/stock',
  authenticate,
  requireVerifiedEmail,
  productMutationRateLimit,
  productsStockController.adjustStock
);
// Gap #3 fix: closes the audit finding — mirrors ads.routes.ts's
// POST/DELETE /:id/images exactly (same middleware order: auth, rate
// limit, multer, then controller).
productsRouter.post(
  '/:id/images',
  authenticate, requireVerifiedEmail,
  addProductImagesRateLimit,
  uploadMultipleMiddleware,
  productsController.addImages
);
productsRouter.delete(
  '/:id/images',
  authenticate,
  requireVerifiedEmail,
  productMutationRateLimit,
  productsController.removeImage
);
// Gap #11: JSON body only (no files) — mirrors ads.routes.ts's reorder route.
productsRouter.put(
  '/:id/images/reorder',
  authenticate,
  requireVerifiedEmail,
  productMutationRateLimit,
  productsController.reorderImages
);
productsRouter.delete(
  '/:id',
  authenticate,
  requireVerifiedEmail,
  productMutationRateLimit,
  productsController.deleteProduct
);
