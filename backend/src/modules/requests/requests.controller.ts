import { Request, Response, NextFunction } from 'express';
import { requestsService } from './requests.service';
import {
  createRequestSchema,
  requestIdSchema,
  getOpenRequestsSchema,
  getMyRequestsSchema,
  getMyOffersSchema,
  submitOfferSchema,
  offerParamsSchema,
} from './requests.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const requestsController = {
  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createRequestSchema.parse({ body: req.body });
      const row = await requestsService.create(user.userId, body);
      res.status(201).json(successResponse('Request created', row));
    } catch (error) {
      next(error);
    }
  },

  getOpenFeed: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getOpenRequestsSchema.parse({ query: req.query });
      const result = await requestsService.getOpenFeed(query);
      res.status(200).json(successResponse('Open requests fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getMyRequests: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getMyRequestsSchema.parse({ query: req.query });
      const result = await requestsService.getMyRequests(user.userId, query);
      res.status(200).json(successResponse('My requests fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getMyOffers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      // T352 — was reusing getMyRequestsSchema whose status enum never matched.
      const { query } = getMyOffersSchema.parse({ query: req.query });
      const result = await requestsService.getMyOffers(user.userId, query);
      res.status(200).json(successResponse('My offers fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = requestIdSchema.parse({ params: req.params });
      const viewerId = req.user?.userId;
      const row = await requestsService.getById(params.id, viewerId);
      res.status(200).json(successResponse('Request fetched', row));
    } catch (error) {
      next(error);
    }
  },

  cancel: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = requestIdSchema.parse({ params: req.params });
      const row = await requestsService.cancel(user.userId, params.id);
      res.status(200).json(successResponse('Request cancelled', row));
    } catch (error) {
      next(error);
    }
  },

  submitOffer: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = submitOfferSchema.parse({ params: req.params, body: req.body });
      const offer = await requestsService.submitOffer(user.userId, params.id, body);
      res.status(201).json(successResponse('Offer submitted', offer));
    } catch (error) {
      next(error);
    }
  },

  withdrawOffer: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = offerParamsSchema.parse({ params: req.params });
      const offer = await requestsService.withdrawOffer(user.userId, params.id, params.offerId);
      res.status(200).json(successResponse('Offer withdrawn', offer));
    } catch (error) {
      next(error);
    }
  },

  acceptOffer: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = offerParamsSchema.parse({ params: req.params });
      const row = await requestsService.acceptOffer(user.userId, params.id, params.offerId);
      res.status(200).json(successResponse('Offer accepted', row));
    } catch (error) {
      next(error);
    }
  },
};
