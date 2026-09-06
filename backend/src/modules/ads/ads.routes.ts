import { Router } from 'express';
import { adsController } from './ads.controller';
import { adsPinController } from './ads-pin.controller';
import { adsRepublishController } from './ads-republish.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import { createAdRateLimit, addAdImagesRateLimit } from '../../middlewares/rateLimit.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const adsRouter = Router();

// Public (with Cache-Control headers)
adsRouter.get('/', CACHE.SHORT, adsController.getAds); // 30s + swr
adsRouter.get('/me', authenticate, CACHE.NONE, adsController.getMyAds);
// Must stay ahead of GET /:id — Express matches routes in registration
// order, and while '/me/stats' wouldn't actually collide with the
// single-segment '/:id' pattern, keeping every '/me/*' route grouped
// together here avoids relying on that distinction being obvious later.
adsRouter.get('/me/stats', authenticate, CACHE.NONE, adsController.getMyStats);
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

// TRACK-SELLER-PIN — body: { isPinned: boolean }
adsRouter.patch('/:id/pin', authenticate, adsPinController.setPinned);

// TRACK-REPUBLISH — clone SOLD/DELETED into a new ACTIVE ad
adsRouter.post(
  '/:id/republish',
  authenticate,
  createAdRateLimit,
  adsRepublishController.republish
);
