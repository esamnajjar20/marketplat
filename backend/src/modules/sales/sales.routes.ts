import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { salesController } from './sales.controller';

export const salesRouter = Router();
salesRouter.use(authenticate);

salesRouter.get('/cost-settings', salesController.costSettings);
salesRouter.patch('/cost-settings', salesController.updateCostSettings);
salesRouter.get('/cost-products', salesController.costProducts);
salesRouter.patch('/cost-products/:productId', salesController.updateProductCost);
salesRouter.post('/', salesController.create);
salesRouter.get('/', salesController.list);
salesRouter.get('/summary', salesController.summary);
salesRouter.get('/chart', salesController.chart);
salesRouter.get('/compare', salesController.compare);
salesRouter.get('/top', salesController.top);
salesRouter.get('/dashboard', salesController.dashboard);
salesRouter.get('/reports', salesController.report);
salesRouter.get('/smart-insights', salesController.smartInsights);
salesRouter.post('/automation/run', salesController.automationRun);
salesRouter.get('/debts/summary', salesController.debtSummary);
salesRouter.get('/debts', salesController.debts);
salesRouter.get('/:id/receipt', salesController.receipt);
salesRouter.get('/:id', salesController.getById);
salesRouter.patch('/:id', salesController.update);
salesRouter.delete('/:id', salesController.remove);
salesRouter.post('/:id/payments', salesController.addPayment);
salesRouter.post('/:id/return', salesController.addReturn);
