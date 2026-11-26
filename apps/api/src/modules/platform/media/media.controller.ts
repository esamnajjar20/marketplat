import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../../shared/types/api-response.types';
import { BadRequestError } from '../../../shared/errors/BadRequestError';
import { requireUser } from '../../../shared/auth/requireUser';
import { createDirectImageUploadIntents } from '../../../shared/media/directImageUpload';
import { directImageIntentSchema } from '../../../shared/media/directImageValidation';

/** Authenticated endpoints for issuing one-time, purpose-bound image intents. */
export const mediaController = {
  createDirectImageIntents: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const input = directImageIntentSchema.parse(req.body);
      const intents = await createDirectImageUploadIntents(user.userId, input.purpose, input.count);
      res.status(201).json(successResponse('Direct upload intents created', { intents }));
    } catch (error) {
      next(error);
    }
  },

  verifyDirectImages: async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Verification-only responses returned reusable public URLs outside the
    // transaction that attached them to a record. Direct uploads must now be
    // submitted as public IDs to the final create/add-images endpoint, where
    // their intents are consumed atomically with the entity write.
    next(new BadRequestError(
      'Submit directImagePublicIds with the entity creation request; standalone verification is disabled.',
      'DIRECT_UPLOAD_VERIFY_REQUIRES_ATOMIC_BINDING'
    ));
  },

  uploadImages: async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // This legacy endpoint returned reusable Cloudinary URLs without an
    // intent record. New clients request signed intents and submit public IDs
    // with the final entity mutation so consumption is atomic with the write.
    next(new BadRequestError(
      'This upload endpoint is retired. Request direct image intents and submit directImagePublicIds with the final create request.',
      'LEGACY_MEDIA_UPLOAD_DISABLED'
    ));
  },
};
