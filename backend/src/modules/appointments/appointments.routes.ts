import { Router } from 'express';
import { appointmentsController } from './appointments.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const appointmentsRouter = Router();

// Public — customers need to see open slots before booking.
appointmentsRouter.get(
  '/availability/:providerId',
  CACHE.SHORT,
  appointmentsController.getAvailability
);

// Provider-only from here down (ownership enforced in the service layer).
appointmentsRouter.get('/me', authenticate, CACHE.NONE, appointmentsController.getMyAppointments);
appointmentsRouter.post('/', authenticate, appointmentsController.createAppointment);
appointmentsRouter.patch('/:id/status', authenticate, appointmentsController.updateAppointmentStatus);
