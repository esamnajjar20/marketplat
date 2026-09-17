import { Request, Response, NextFunction } from 'express';
import { uploadImage } from '../../config/cloudinary';
import { successResponse } from '../../shared/types/api-response.types';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { requireUser } from '../../shared/utils/requireUser';

/**
 * Generic authenticated image upload for clients that need a URL before
 * calling JSON endpoints (e.g. Open Requests attachedImages).
 */
export const mediaController = {
  uploadImages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireUser(req);
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        throw new BadRequestError('At least one image is required.', 'NO_IMAGES');
      }
      const uploaded = [];
      for (const file of files) {
        const result = await uploadImage(file.buffer, 'requests');
        uploaded.push({ url: result.url, publicId: result.publicId });
      }
      res.status(201).json(successResponse('Images uploaded', uploaded));
    } catch (error) {
      next(error);
    }
  },
};
