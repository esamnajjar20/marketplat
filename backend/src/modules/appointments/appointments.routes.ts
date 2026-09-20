import { Router } from 'express';
import { appointmentsController } from './appointments.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
// FIX RATE-LIMIT-APPOINTMENTS-01: every mutation here used to rely
// only on the global 600/15min cap. The public availability read was
// scrapable and the two mutations could be scripted to fill a
// provider's calendar.
import {
  availabilityRateLimit,
  createAppointmentRateLimit,
  appointmentUpdateRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const appointmentsRouter = Router();

// Public — customers need to see open slots before booking.
appointmentsRouter.get(
  '/availability/:providerId',
  CACHE.SHORT,
  availabilityRateLimit,
  appointmentsController.getAvailability
);

// Provider-only from here down (ownership enforced in the service layer).
appointmentsRouter.get('/me', authenticate, CACHE.NONE, appointmentsController.getMyAppointments);
appointmentsRouter.post('/', authenticate, createAppointmentRateLimit, appointmentsController.createAppointment);
appointmentsRouter.patch('/:id/status', authenticate, appointmentUpdateRateLimit, appointmentsController.updateAppointmentStatus);
