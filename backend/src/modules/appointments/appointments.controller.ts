import { Request, Response, NextFunction } from 'express';
import { appointmentsService } from './appointments.service';
import {
  createAppointmentSchema,
  updateAppointmentStatusSchema,
  availabilitySchema,
  getAppointmentsSchema,
} from './appointments.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const appointmentsController = {
  createAppointment: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createAppointmentSchema.parse({ body: req.body });
      const appointment = await appointmentsService.createAppointment(user.userId, body);
      res.status(201).json(successResponse('Appointment created', appointment));
    } catch (error) {
      next(error);
    }
  },

  getMyAppointments: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getAppointmentsSchema.parse({ query: req.query });
      const result = await appointmentsService.getMyAppointments(user.userId, query);
      res
        .status(200)
        .json(successResponse('Appointments fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  updateAppointmentStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = updateAppointmentStatusSchema.parse({
        params: req.params,
        body: req.body,
      });
      const appointment = await appointmentsService.updateAppointmentStatus(
        user.userId,
        params.id,
        body.status
      );
      res.status(200).json(successResponse('Appointment updated', appointment));
    } catch (error) {
      next(error);
    }
  },

  getAvailability: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, query } = availabilitySchema.parse({ params: req.params, query: req.query });
      const availability = await appointmentsService.getAvailability(params.providerId, query.date);
      res.status(200).json(successResponse('Availability fetched', availability));
    } catch (error) {
      next(error);
    }
  },
};
