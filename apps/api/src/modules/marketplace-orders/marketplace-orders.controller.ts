import { Request, Response, NextFunction } from 'express';
import { requireUser } from '../../shared/utils/requireUser';
import { successResponse } from '../../shared/types/api-response.types';
import { marketplaceOrdersService } from './marketplace-orders.service';
import { createMarketplaceOrderSchema, listMarketplaceOrdersSchema, marketplaceOrderIdSchema, updateMarketplaceOrderStatusSchema } from './marketplace-orders.validation';

export const marketplaceOrdersController = {
  create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createMarketplaceOrderSchema.parse({ body: { ...req.body, idempotencyKey: req.body?.idempotencyKey ?? req.headers['idempotency-key'] } });
      const order = await marketplaceOrdersService.create(user.userId, body);
      res.status(201).json(successResponse('Order placed', order));
    } catch (error) { next(error); }
  },
  listMine: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = listMarketplaceOrdersSchema.parse({ query: req.query });
      const result = await marketplaceOrdersService.listMine(user.userId, query);
      res.status(200).json(successResponse('Your orders fetched', result.items, { pagination: result.meta }));
    } catch (error) { next(error); }
  },
  listForStore: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = listMarketplaceOrdersSchema.parse({ query: req.query });
      const result = await marketplaceOrdersService.listForStore(user.userId, query);
      res.status(200).json(successResponse('Store orders fetched', result.items, { pagination: result.meta }));
    } catch (error) { next(error); }
  },
  getById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = marketplaceOrderIdSchema.parse({ params: req.params });
      res.status(200).json(successResponse('Order fetched', await marketplaceOrdersService.getById(user.userId, params.id)));
    } catch (error) { next(error); }
  },
  updateStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateMarketplaceOrderStatusSchema.parse({ params: req.params, body: req.body });
      res.status(200).json(successResponse('Order status updated', await marketplaceOrdersService.updateStatus(user.userId, params.id, body.status, body.sellerNote)));
    } catch (error) { next(error); }
  },
};
