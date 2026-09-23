import { Router } from 'express';
import { promotionsController } from './promotions.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import {
  createPromotionRateLimit,
  updatePromotionRateLimit,
  cancelPromotionRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const promotionsRouter = Router();

// All routes are store-owner-only — enforced in promotions.service.ts
// via requireOwnStoreForProducts, same convention as products.routes.ts.
// There is no public GET here: public consumers see promotion effects
// through products.controller.ts's effectivePrice fields, not through
// this module directly (see promotions.controller.ts's getMyPromotions
// doc comment).
promotionsRouter.post('/', authenticate, requireVerifiedEmail, createPromotionRateLimit, promotionsController.createPromotion);
promotionsRouter.get('/me', authenticate, promotionsController.getMyPromotions);
promotionsRouter.get('/:id', authenticate, promotionsController.getPromotionById);
promotionsRouter.patch('/:id', authenticate, updatePromotionRateLimit, promotionsController.updatePromotion);
promotionsRouter.delete('/:id', authenticate, cancelPromotionRateLimit, promotionsController.cancelPromotion);
