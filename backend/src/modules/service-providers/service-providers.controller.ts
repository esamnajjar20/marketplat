import { Request, Response, NextFunction } from 'express';
import { serviceProvidersService } from './service-providers.service';
import {
  createServiceProviderSchema,
  updateServiceProviderSchema,
  serviceProviderIdSchema,
  nearbyServiceProvidersSchema,
} from './service-providers.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const serviceProvidersController = {
  createServiceProvider: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createServiceProviderSchema.parse({ body: req.body });
      const details = await serviceProvidersService.createServiceProvider(user.userId, body);
      res.status(201).json(successResponse('Service provider profile created', details));
    } catch (error) {
      next(error);
    }
  },

  getMyServiceProvider: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const details = await serviceProvidersService.getMyServiceProvider(user.userId);
      res.status(200).json(successResponse('Service provider profile fetched', details));
    } catch (error) {
      next(error);
    }
  },

  updateMyServiceProvider: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = updateServiceProviderSchema.parse({ body: req.body });
      const details = await serviceProvidersService.updateMyServiceProvider(user.userId, body);
      res.status(200).json(successResponse('Service provider profile updated', details));
    } catch (error) {
      next(error);
    }
  },

  getPublicServiceProvider: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = serviceProviderIdSchema.parse({ params: req.params });
      const details = await serviceProvidersService.getPublicServiceProvider(params.id);
      res.status(200).json(successResponse('Service provider fetched', details));
    } catch (error) {
      next(error);
    }
  },

  getNearby: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = nearbyServiceProvidersSchema.parse({ query: req.query });
      const { providers, meta } = await serviceProvidersService.findNearby(query);
      res
        .status(200)
        .json(
          successResponse('Nearby service providers fetched', providers, { pagination: meta })
        );
    } catch (error) {
      next(error);
    }
  },
};
