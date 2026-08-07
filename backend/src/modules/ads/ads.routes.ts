import { Router } from 'express';
import { adsController } from './ads.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import { createAdRateLimit, addAdImagesRateLimit } from '../../middlewares/rateLimit.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const adsRouter = Router();

// Public (with Cache-Control headers)
adsRouter.get('/', CACHE.SHORT, adsController.getAds); // 30s + swr
adsRouter.get('/me', authenticate, CACHE.NONE, adsController.getMyAds);
adsRouter.get('/search', CACHE.SHORT, adsController.searchAds); // A-05: replaces /search module
adsRouter.get('/:id', CACHE.MEDIUM, adsController.getAdById); // 60s + swr
adsRouter.get('/:id/related', CACHE.SHORT, adsController.getRelatedAds);

// Protected
adsRouter.post(
  '/',
  authenticate,
  createAdRateLimit,
  uploadMultipleMiddleware,
  adsController.createAd
);
adsRouter.patch('/:id', authenticate, adsController.updateAd);
adsRouter.post('/:id/images', authenticate, addAdImagesRateLimit, uploadMultipleMiddleware, adsController.addImages);
adsRouter.delete('/:id/images', authenticate, adsController.removeImage);
// Gap #11: JSON body only (no files), so no multer/upload rate limit —
// just auth, same as PATCH /:id above.
adsRouter.put('/:id/images/reorder', authenticate, adsController.reorderImages);
adsRouter.delete('/:id', authenticate, adsController.deleteAd);
