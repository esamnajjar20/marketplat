import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { customersController } from './customers.controller';

export const customersRouter = Router();
customersRouter.use(authenticate);
customersRouter.get('/summary', customersController.summary);
customersRouter.get('/', customersController.list);
customersRouter.get('/search', customersController.search);
customersRouter.get('/:id', customersController.getById);
customersRouter.post('/', customersController.create);
customersRouter.patch('/:id', customersController.update);
