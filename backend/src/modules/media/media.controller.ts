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
      // PERF — parallelize the uploads. Previously this was a
      // for-of-loop with `await uploadImage(...)` inside, so N files
      // cost N × (Cloudinary round-trip) serially — 5 images at ~2s
      // each meant a ~10s HTTP request even though the uploads are
      // completely independent. Promise.all collapses it back to
      // max(single-upload time) ≈ 2s.
      //
      // Promise.all rejects on the first failure, but the OTHER
      // in-flight uploads are NOT cancelled — their Cloudinary assets
      // will still be created. The route is not transactional (it's
      // the caller's job to decide what to do with a partial batch
      // when it gets a 500), and the alternative — sequential with
      // per-file error handling — reintroduces the latency problem
      // this Same trade-off as every other multi-image upload
      // path in this codebase.
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const result = await uploadImage(file.buffer, 'requests');
          return { url: result.url, publicId: result.publicId };
        }),
      );
      res.status(201).json(successResponse('Images uploaded', uploaded));
    } catch (error) {
      next(error);
    }
  },
};
