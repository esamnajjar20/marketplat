import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';
import { adjustProductStockSchema, stockHistoryQuerySchema } from './products-stock.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const productsStockController = {
  adjustStock: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = adjustProductStockSchema.parse({ params: req.params, body: req.body });
      const product = await productsService.adjustStock(
        user.userId,
        params.id,
        body.stockQuantity,
        body.reason,
      );
      res.status(200).json(successResponse('Stock updated', product));
    } catch (error) {
      next(error);
    }
  },

  getSummary: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const summary = await productsService.getStockSummary(user.userId);
      res.status(200).json(successResponse('Stock summary fetched', summary));
    } catch (error) {
      next(error);
    }
  },

  getHistory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = stockHistoryQuerySchema.parse({ query: req.query });
      const result = await productsService.getStockHistory(user.userId, query);
      res.status(200).json(successResponse('Stock history fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
