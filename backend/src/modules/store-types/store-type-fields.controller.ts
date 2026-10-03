import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../shared/types/api-response.types';
import { storeTypeFieldsService } from './store-type-fields.service';
import { createStoreTypeFieldSchema, storeTypeFieldListSchema, updateStoreTypeFieldSchema } from './store-type-fields.validation';

export const storeTypeFieldsController = {
  getPublic: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = storeTypeFieldListSchema.parse({ params: req.params });
      const fields = await storeTypeFieldsService.getPublic(params.storeTypeId);
      res.status(200).json(successResponse('Store type fields fetched', fields));
    } catch (error) { next(error); }
  },
  getAdmin: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = storeTypeFieldListSchema.parse({ params: req.params });
      const fields = await storeTypeFieldsService.getAdmin(params.storeTypeId);
      res.status(200).json(successResponse('Store type fields fetched', fields));
    } catch (error) { next(error); }
  },
  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = createStoreTypeFieldSchema.parse({ params: req.params, body: req.body });
      const field = await storeTypeFieldsService.create(params.storeTypeId, body);
      res.status(201).json(successResponse('Store type field created', field));
    } catch (error) { next(error); }
  },
  update: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateStoreTypeFieldSchema.parse({ params: req.params, body: req.body });
      const field = await storeTypeFieldsService.update(params.storeTypeId, params.fieldId, body);
      res.status(200).json(successResponse('Store type field updated', field));
    } catch (error) { next(error); }
  },
};
