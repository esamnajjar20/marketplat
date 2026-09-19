import { Router } from 'express';
import { observabilityController } from './observability.controller';
import { analyticsEventsRateLimit } from '../../middlewares/rateLimit.middleware';

/**
 * FIX OBSERVABILITY-CLIENT-ERROR-01: public write endpoint — no
 * authenticate middleware, because errors happen before login too
 * (and, more importantly, because a broken login is exactly when
 * you most need the error report to land). Abuse is bounded by:
 *   - analyticsEventsRateLimit (120/min per IP)
 *   - the size / field caps in observability.validation.ts
 *   - CSRF_EXEMPT_PATHS entry in csrf.middleware.ts (this endpoint
 *     accepts anonymous reports by design; the CSRF cookie is present
 *     on authenticated requests but the frontend reporter doesn't
 *     echo the header, so it must be explicitly exempt or every
 *     report from a logged-in user would 403)
 */
export const observabilityRouter = Router();

observabilityRouter.post(
  '/client-error',
  analyticsEventsRateLimit,
  observabilityController.clientError,
);
