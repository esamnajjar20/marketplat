import { Request, Response, NextFunction } from 'express';
import { serviceListingsService } from './service-listings.service';
import {
  createServiceListingSchema,
  updateServiceListingSchema,
  serviceListingIdSchema,
  getServiceListingsSchema,
} from './service-listings.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { z } from 'zod';

export const serviceListingsController = {
  createServiceListing: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createServiceListingSchema.parse({ body: req.body });
      const files = (req.files as Express.Multer.File[]) || [];
      const listing = await serviceListingsService.createServiceListing(user.userId, body, files);
      res.status(201).json(successResponse('Service listing created', listing));
    } catch (error) {
      next(error);
    }
  },

  getMyServiceListings: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getServiceListingsSchema.parse({ query: req.query });
      const result = await serviceListingsService.getMyServiceListings(user.userId, query);
      res
        .status(200)
        .json(
          successResponse('My service listings fetched', result.items, {
            pagination: result.meta,
          })
        );
    } catch (error) {
      next(error);
    }
  },

  getServiceListings: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getServiceListingsSchema.parse({ query: req.query });
      const result = await serviceListingsService.getServiceListings(query);
      res
        .status(200)
        .json(
          successResponse('Service listings fetched', result.items, { pagination: result.meta })
        );
    } catch (error) {
      next(error);
    }
  },

  getServiceListingById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = serviceListingIdSchema.parse({ params: req.params });
      const listing = await serviceListingsService.getServiceListingById(params.id);
      res.status(200).json(successResponse('Service listing fetched', listing));
    } catch (error) {
      next(error);
    }
  },

  updateServiceListing: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateServiceListingSchema.parse({
        params: req.params,
        body: req.body,
      });
      const listing = await serviceListingsService.updateServiceListing(user.userId, params.id, body);
      res.status(200).json(successResponse('Service listing updated', listing));
    } catch (error) {
      next(error);
    }
  },

  deleteServiceListing: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = serviceListingIdSchema.parse({ params: req.params });
      await serviceListingsService.deleteServiceListing(user.userId, params.id);
      res.status(200).json(successResponse('Service listing deleted'));
    } catch (error) {
      next(error);
    }
  },

  // Gap #3 fix: mirrors adsController.addImages exactly.
  addImages: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = serviceListingIdSchema.parse({ params: req.params });
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) throw new BadRequestError('No images provided');
      const listing = await serviceListingsService.addImages(params.id, user.userId, files);
      res.status(200).json(successResponse('Images added', listing));
    } catch (error) {
      next(error);
    }
  },

  // Gap #3 fix: mirrors adsController.removeImage exactly.
  removeImage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = serviceListingIdSchema.parse({ params: req.params });
      const { imageUrl } = z.object({ imageUrl: z.string().url() }).parse(req.body);
      const listing = await serviceListingsService.removeImage(params.id, user.userId, imageUrl);
      res.status(200).json(successResponse('Image removed', listing));
    } catch (error) {
      next(error);
    }
  },
};
