import { Router } from 'express';
import { appointmentsController } from './appointments.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
// every mutation here used to rely
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

// Authenticated appointments. The service layer authorizes provider-owned
// appointments plus customer actions on appointments linked to their requests.
appointmentsRouter.get('/me', authenticate, CACHE.NONE, appointmentsController.getMyAppointments);
// the two mutations had a rate limit but
// no requireVerifiedEmail, while every parallel mutation on the
// sibling modules has both.
appointmentsRouter.post(
  '/',
  authenticate, requireVerifiedEmail,
  createAppointmentRateLimit,
  appointmentsController.createAppointment
);
appointmentsRouter.patch(
  '/:id/status',
  authenticate, requireVerifiedEmail,
  appointmentUpdateRateLimit,
  appointmentsController.updateAppointmentStatus
);
