import { Router } from 'express';
import { mediaController } from './media.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import { mediaUploadRateLimit } from '../../middlewares/rateLimit.middleware';

export const mediaRouter = Router();

// T520 — dedicated rate bucket (was reusing createOpenRequestRateLimit,
// which coupled image-staging traffic to the open-request creation
// budget). Same ceiling, isolated Redis prefix.
mediaRouter.post(
  '/images',
  authenticate,
  mediaUploadRateLimit,
  uploadMultipleMiddleware,
  mediaController.uploadImages,
);
