import { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { successResponse } from '../../shared/types/api-response.types';
import { serviceTypesService } from './service-types.service';
import { createServiceTypeFieldSchema, createServiceTypeSchema, serviceTypeIdSchema, updateServiceTypeFieldSchema, updateServiceTypeSchema } from './service-types.validation';

export const serviceTypesController = {
  getActive: async (_req: Request, res: Response, next: NextFunction) => { try { res.status(200).json(successResponse('Service types fetched', await serviceTypesService.getActive())); } catch (e) { next(e); } },
  getAllForAdmin: async (_req: Request, res: Response, next: NextFunction) => { try { res.status(200).json(successResponse('Service types fetched', await serviceTypesService.getAllForAdmin())); } catch (e) { next(e); } },
  create: async (req: Request, res: Response, next: NextFunction) => { try { const { body } = createServiceTypeSchema.parse({ body: req.body }); res.status(201).json(successResponse('Service type created', await serviceTypesService.create(body))); } catch (e) { next(e); } },
  update: async (req: Request, res: Response, next: NextFunction) => { try { const { params, body } = updateServiceTypeSchema.parse({ params: req.params, body: req.body }); res.status(200).json(successResponse('Service type updated', await serviceTypesService.update(params.id, body))); } catch (e) { next(e); } },
  createField: async (req: Request, res: Response, next: NextFunction) => { try { const { body } = createServiceTypeFieldSchema.parse({ body: req.body }); res.status(201).json(successResponse('Service type field created', await serviceTypesService.createField(body))); } catch (e) { next(e); } },
  updateField: async (req: Request, res: Response, next: NextFunction) => { try { const { params, body } = updateServiceTypeFieldSchema.parse({ params: req.params, body: req.body }); res.status(200).json(successResponse('Service type field updated', await serviceTypesService.updateField(params.id, body))); } catch (e) { next(e); } },
  deleteField: async (req: Request, res: Response, next: NextFunction) => { try { const { params } = serviceTypeIdSchema.parse({ params: req.params }); await serviceTypesService.deleteField(params.id); res.status(200).json(successResponse('Service type field deleted')); } catch (e) { next(e); } },
};
