import { Request, Response, NextFunction } from 'express';
import { serviceRequestsService } from './service-requests.service';
import {
  createServiceRequestSchema,
  respondToServiceRequestSchema,
  serviceRequestIdSchema,
  getServiceRequestsSchema,
} from './service-requests.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const serviceRequestsController = {
  createRequest: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createServiceRequestSchema.parse({ body: req.body });
      const request = await serviceRequestsService.createRequest(user.userId, body);
      res.status(201).json(successResponse('Service request created', request));
    } catch (error) {
      next(error);
    }
  },

  getRequestById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = serviceRequestIdSchema.parse({ params: req.params });
      const request = await serviceRequestsService.getRequestById(user.userId, params.id);
      res.status(200).json(successResponse('Service request fetched', request));
    } catch (error) {
      next(error);
    }
  },

  getMyRequestsAsCustomer: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getServiceRequestsSchema.parse({ query: req.query });
      const result = await serviceRequestsService.getMyRequestsAsCustomer(user.userId, query);
      res
        .status(200)
        .json(
          successResponse('My service requests fetched', result.items, {
            pagination: result.meta,
          })
        );
    } catch (error) {
      next(error);
    }
  },

  getMyRequestsAsProvider: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getServiceRequestsSchema.parse({ query: req.query });
      const result = await serviceRequestsService.getMyRequestsAsProvider(user.userId, query);
      res
        .status(200)
        .json(
          successResponse('Incoming service requests fetched', result.items, {
            pagination: result.meta,
          })
        );
    } catch (error) {
      next(error);
    }
  },

  respondToRequest: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = respondToServiceRequestSchema.parse({
        params: req.params,
        body: req.body,
      });
      const request = await serviceRequestsService.respondToRequest(
        user.userId,
        params.id,
        body.action,
        { quotedPrice: body.quotedPrice, agreedPrice: body.agreedPrice }
      );
      res.status(200).json(successResponse('Service request updated', request));
    } catch (error) {
      next(error);
    }
  },
};
