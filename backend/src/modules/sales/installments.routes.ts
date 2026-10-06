import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { installmentsController } from './installments.controller';
export const installmentsRouter=Router();
installmentsRouter.use(authenticate);
installmentsRouter.get('/upcoming',installmentsController.upcoming);
installmentsRouter.get('/overdue',installmentsController.overdue);
installmentsRouter.post('/:id/pay',installmentsController.pay);
