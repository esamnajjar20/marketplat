import { Request, Response, NextFunction } from 'express';
import { adsService } from './ads.service';
import {
  createAdSchema,
  updateAdSchema,
  getAdsSchema,
  getMyAdsSchema,
  adIdSchema,
  searchAdsSchema,
} from './ads.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { z } from 'zod';

export const adsController = {
  createAd: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createAdSchema.parse({ body: req.body });
      const files = (req.files as Express.Multer.File[]) || [];
      // FIX LOAD-TEST-01: the frontend's AdForm.validate() enforces "at
      // least one image" as a UI-only rule (see AdForm.tsx's
      // e.images = 'أضف صورة واحدة على الأقل' check) — nothing on the
      // backend actually enforced it. addImages (below) already checks
      // files.length === 0, but createAd had no equivalent, so any
      // direct API client (not just a malicious one — a load-testing
      // script hitting this endpoint directly is exactly this kind of
      // client) could publish an ad with zero images, bypassing what
      // every real user going through the UI is required to provide.
      //
      // TODO(TRACK-IMG-HOSTING): re-enable once image hosting (e.g.
      // Cloudinary) is configured in this environment — this check is
      // disabled below so ads can be created and tested end-to-end
      // (including checking indexing/appearance on Google) without a
      // working upload service.
      //
      // Re-enable by: uncommenting the throw below AND un-skipping the
      // corresponding it.skip cases in ads.controller.test.ts (search
      // that file for TRACK-IMG-HOSTING) that assert this 400. Both
      // sides must flip together or the tests will silently pass
      // against dead code again.
      // if (files.length === 0) throw new BadRequestError('At least one image is required');
      const ad = await adsService.createAd(user.userId, body, files);
      res.status(201).json(successResponse('Ad created', ad));
    } catch (error) {
      next(error);
    }
  },

  getAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getAdsSchema.parse({ query: req.query });
      const result = await adsService.getAds(query);
      res
        .status(200)
        .json(successResponse('Ads fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getAdById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = adIdSchema.parse({ params: req.params });
      const viewerIp = req.ip;
      const ad = await adsService.getAdById(params.id, viewerIp);
      res.status(200).json(successResponse('Ad fetched', ad));
    } catch (error) {
      next(error);
    }
  },

  getMyAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      // FIX D-24: was getAdsSchema (no status field) — now getMyAdsSchema,
      // which accepts a user-supplied status scoped to ACTIVE/SOLD only.
      const { query } = getMyAdsSchema.parse({ query: req.query });
      const result = await adsService.getMyAds(user.userId, query);
      res
        .status(200)
        .json(successResponse('My ads fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getRelatedAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = adIdSchema.parse({ params: req.params });
      const ads = await adsService.getRelatedAds(params.id);
      res.status(200).json(successResponse('Related ads fetched', ads));
    } catch (error) {
      next(error);
    }
  },

  updateAd: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateAdSchema.parse({ params: req.params, body: req.body });
      const ad = await adsService.updateAd(params.id, user.userId, user.role, body);
      res.status(200).json(successResponse('Ad updated', ad));
    } catch (error) {
      next(error);
    }
  },

  addImages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = adIdSchema.parse({ params: req.params });
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) throw new BadRequestError('No images provided');
      const ad = await adsService.addImages(params.id, user.userId, user.role, files);
      res.status(200).json(successResponse('Images added', ad));
    } catch (error) {
      next(error);
    }
  },

  removeImage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = adIdSchema.parse({ params: req.params });
      const { imageUrl } = z.object({ imageUrl: z.string().url() }).parse(req.body);
      const ad = await adsService.removeImage(params.id, user.userId, user.role, imageUrl);
      res.status(200).json(successResponse('Image removed', ad));
    } catch (error) {
      next(error);
    }
  },

  // Gap #11: mirrors addImages/removeImage exactly.
  reorderImages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = adIdSchema.parse({ params: req.params });
      const { images } = z.object({ images: z.array(z.string().url()).min(1) }).parse(req.body);
      const ad = await adsService.reorderImages(params.id, user.userId, user.role, images);
      res.status(200).json(successResponse('Images reordered', ad));
    } catch (error) {
      next(error);
    }
  },

  searchAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // A-05: search handler lives here — no separate search module needed
      const { query } = searchAdsSchema.parse({ query: req.query });
      const { q, ...filters } = query;
      const result = await adsService.getAds({ ...filters, search: q }); // reuses same service method
      res
        .status(200)
        .json(successResponse('Search results', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  deleteAd: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = adIdSchema.parse({ params: req.params });
      await adsService.deleteAd(params.id, user.userId, user.role);
      res.status(200).json(successResponse('Ad deleted'));
    } catch (error) {
      next(error);
    }
  },
};
