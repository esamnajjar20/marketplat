import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { salesController } from './sales.controller';

export const salesRouter = Router();
salesRouter.use(authenticate);

salesRouter.post('/', salesController.create);
salesRouter.get('/', salesController.list);
salesRouter.get('/summary', salesController.summary);
salesRouter.get('/chart', salesController.chart);
salesRouter.get('/compare', salesController.compare);
salesRouter.get('/top', salesController.top);
salesRouter.get('/debts', salesController.debts);
salesRouter.get('/:id/receipt', salesController.receipt);
salesRouter.get('/:id', salesController.getById);
salesRouter.patch('/:id', salesController.update);
salesRouter.delete('/:id', salesController.remove);
salesRouter.post('/:id/payments', salesController.addPayment);
salesRouter.post('/:id/return', salesController.addReturn);
