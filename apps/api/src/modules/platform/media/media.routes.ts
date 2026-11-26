import { Router } from 'express';
import { mediaController } from './media.controller';
import { authenticate } from '../../../middlewares/auth.middleware';
import { mediaUploadRateLimit } from '../../../middlewares/rateLimit.middleware';

export const mediaRouter = Router();

mediaRouter.post('/direct/intents', authenticate, mediaUploadRateLimit, mediaController.createDirectImageIntents);
mediaRouter.post('/direct/verify', authenticate, mediaUploadRateLimit, mediaController.verifyDirectImages);

// Retained as a compatibility response only; the retired endpoint does not
// run Multer or accept image bytes, so legacy requests cannot bypass intents.
mediaRouter.post(
  '/images',
  authenticate,
  mediaUploadRateLimit,
  mediaController.uploadImages
);
