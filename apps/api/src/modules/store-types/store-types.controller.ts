import { Request, Response, NextFunction } from 'express';
import { storeTypesService } from './store-types.service';
import {
  createStoreTypeSchema,
  updateStoreTypeSchema,
  updateStoreTypeStatusSchema,
} from './store-types.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const storeTypesController = {
  getActive: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const types = await storeTypesService.getActive();
      res.status(200).json(successResponse('Store types fetched', types));
    } catch (error) {
      next(error);
    }
  },

  getAllForAdmin: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const types = await storeTypesService.getAllForAdmin();
      res.status(200).json(successResponse('Store types fetched', types));
    } catch (error) {
      next(error);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = createStoreTypeSchema.parse({ body: req.body });
      const type = await storeTypesService.create(body);
      res.status(201).json(successResponse('Store type created', type));
    } catch (error) {
      next(error);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateStoreTypeSchema.parse({
        params: req.params,
        body: req.body,
      });
      const type = await storeTypesService.update(params.id, body);
      res.status(200).json(successResponse('Store type updated', type));
    } catch (error) {
      next(error);
    }
  },

  updateStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateStoreTypeStatusSchema.parse({
        params: req.params,
        body: req.body,
      });
      const type = await storeTypesService.updateStatus(params.id, body);
      res.status(200).json(successResponse('Store type status updated', type));
    } catch (error) {
      next(error);
    }
  },
};
