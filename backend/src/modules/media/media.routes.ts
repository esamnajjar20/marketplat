import { Router } from 'express';
import { mediaController } from './media.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import { createOpenRequestRateLimit } from '../../middlewares/rateLimit.middleware';

export const mediaRouter = Router();

// Reuse open-request rate bucket — image staging for requests should not
// outpace request creation itself.
mediaRouter.post(
  '/images',
  authenticate,
  createOpenRequestRateLimit,
  uploadMultipleMiddleware,
  mediaController.uploadImages,
);
