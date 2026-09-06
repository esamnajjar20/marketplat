import { Request, Response, NextFunction } from 'express';
import { productsService } from './products.service';
import { adjustProductStockSchema } from './products-stock.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const productsStockController = {
  adjustStock: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = adjustProductStockSchema.parse({
        params: req.params,
        body: req.body,
      });
      // Reuses updateProduct so availability derivation + restock
      // notifications stay consistent with a full product PATCH.
      const product = await productsService.updateProduct(user.userId, params.id, {
        stockQuantity: body.stockQuantity,
      });
      res.status(200).json(successResponse('Stock updated', product));
    } catch (error) {
      next(error);
    }
  },
};
