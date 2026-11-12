import type { Router } from 'express';
import { serviceProvidersRouter } from '../modules/services/service-providers';
import { serviceCategoriesRouter } from '../modules/services/service-categories';
import { serviceTypesRouter } from '../modules/services/service-types';
import { serviceListingsRouter } from '../modules/services/service-listings';
import { serviceRequestsRouter } from '../modules/services/service-requests';
import { serviceReviewsRouter } from '../modules/services/service-reviews';
import { appointmentsRouter } from '../modules/services/appointments';

/** The services marketplace: providers, listings, requests, reviews, bookings. */
export function registerServicesRoutes(router: Router): void {
  router.use('/service-providers', serviceProvidersRouter);
  router.use('/service-categories', serviceCategoriesRouter);
  router.use('/service-types', serviceTypesRouter);
  router.use('/service-listings', serviceListingsRouter);
  router.use('/service-requests', serviceRequestsRouter);
  router.use('/appointments', appointmentsRouter);
  router.use('/service-reviews', serviceReviewsRouter);
}
