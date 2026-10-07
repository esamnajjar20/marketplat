import { Request, Response, NextFunction } from 'express';
import { customersService } from './customers.service';
import { createCustomerSchema, updateCustomerSchema, customerIdSchema, customerSearchSchema, listCustomersSchema } from './customers.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const customersController = {
  summary: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); res.json(successResponse('Customer summary fetched', await customersService.summary(user.userId))); } catch (e) { next(e); } },
  list: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); const { query } = listCustomersSchema.parse({ query: req.query }); res.json(successResponse('Customers fetched', await customersService.list(user.userId, query))); } catch (e) { next(e); } },
  getById: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); const { params } = customerIdSchema.parse({ params: req.params }); res.json(successResponse('Customer fetched', await customersService.getById(user.userId, params.id))); } catch (e) { next(e); } },
  create: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); const { body } = createCustomerSchema.parse({ body: req.body }); res.status(201).json(successResponse('Customer created', await customersService.create(user.userId, body))); } catch (e) { next(e); } },
  update: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); const parsed = updateCustomerSchema.parse({ params: req.params, body: req.body }); res.json(successResponse('Customer updated', await customersService.update(user.userId, parsed.params.id, parsed.body))); } catch (e) { next(e); } },
  search: async (req: Request, res: Response, next: NextFunction) => { try { const user = requireUser(req); const { query } = customerSearchSchema.parse({ query: req.query }); res.json(successResponse('Customers found', await customersService.search(user.userId, query.q))); } catch (e) { next(e); } },
};
