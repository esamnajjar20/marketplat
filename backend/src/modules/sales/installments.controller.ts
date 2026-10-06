import { Request, Response, NextFunction } from 'express';
import { installmentsService } from './installments.service';
import { installmentIdSchema, payInstallmentSchema } from './installments.validation';
import { requireUser } from '../../shared/utils/requireUser';
import { successResponse } from '../../shared/types/api-response.types';
export const installmentsController = {
  upcoming: async (req: Request,res: Response,next: NextFunction)=>{try{const u=requireUser(req);res.json(successResponse('Upcoming installments fetched',await installmentsService.upcoming(u.userId)));}catch(e){next(e);}},
  overdue: async (req: Request,res: Response,next: NextFunction)=>{try{const u=requireUser(req);res.json(successResponse('Overdue installments fetched',await installmentsService.overdue(u.userId)));}catch(e){next(e);}},
  pay: async (req: Request,res: Response,next: NextFunction)=>{try{const u=requireUser(req);const p=payInstallmentSchema.parse({params:req.params,body:req.body});res.json(successResponse('Installment paid',await installmentsService.pay(u.userId,p.params.id,p.body.amount)));}catch(e){next(e);}},
};
