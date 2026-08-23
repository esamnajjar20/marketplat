import { Request, Response, NextFunction } from 'express';
import { serviceBroadcastsService } from './service-broadcasts.service';
import {
  createBroadcastSchema,
  broadcastIdSchema,
  getOpenBroadcastsSchema,
  getMyBroadcastsSchema,
  submitQuoteSchema,
  quoteParamsSchema,
} from './service-broadcasts.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const serviceBroadcastsController = {
  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createBroadcastSchema.parse({ body: req.body });
      const broadcast = await serviceBroadcastsService.create(user.userId, body);
      res.status(201).json(successResponse('Service broadcast created', broadcast));
    } catch (error) {
      next(error);
    }
  },

  getOpenFeed: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getOpenBroadcastsSchema.parse({ query: req.query });
      const result = await serviceBroadcastsService.getOpenFeed(query);
      res.status(200).json(successResponse('Open broadcasts fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getMyBroadcasts: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getMyBroadcastsSchema.parse({ query: req.query });
      const result = await serviceBroadcastsService.getMyBroadcasts(user.userId, query);
      res.status(200).json(successResponse('My broadcasts fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getMyQuotes: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getMyBroadcastsSchema.parse({ query: req.query });
      const result = await serviceBroadcastsService.getMyQuotes(user.userId, query);
      res.status(200).json(successResponse('My quotes fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = broadcastIdSchema.parse({ params: req.params });
      const broadcast = await serviceBroadcastsService.getById(params.id);
      res.status(200).json(successResponse('Broadcast fetched', broadcast));
    } catch (error) {
      next(error);
    }
  },

  cancel: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = broadcastIdSchema.parse({ params: req.params });
      const broadcast = await serviceBroadcastsService.cancel(user.userId, params.id);
      res.status(200).json(successResponse('Broadcast cancelled', broadcast));
    } catch (error) {
      next(error);
    }
  },

  submitQuote: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = submitQuoteSchema.parse({ params: req.params, body: req.body });
      const quote = await serviceBroadcastsService.submitQuote(user.userId, params.id, body);
      res.status(201).json(successResponse('Quote submitted', quote));
    } catch (error) {
      next(error);
    }
  },

  withdrawQuote: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = quoteParamsSchema.parse({ params: req.params });
      const quote = await serviceBroadcastsService.withdrawQuote(user.userId, params.quoteId);
      res.status(200).json(successResponse('Quote withdrawn', quote));
    } catch (error) {
      next(error);
    }
  },

  acceptQuote: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = quoteParamsSchema.parse({ params: req.params });
      const broadcast = await serviceBroadcastsService.acceptQuote(user.userId, params.id, params.quoteId);
      res.status(200).json(successResponse('Quote accepted', broadcast));
    } catch (error) {
      next(error);
    }
  },
};
