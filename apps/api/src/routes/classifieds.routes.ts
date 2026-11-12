import type { Router } from 'express';
import { adsRouter } from '../modules/classifieds/ads';
import { categoriesRouter } from '../modules/classifieds/categories';
import { requestsRouter } from '../modules/classifieds/requests';

/** Classified ads, their categories and open buyer requests. */
export function registerClassifiedsRoutes(router: Router): void {
  router.use('/ads', adsRouter);
  router.use('/categories', categoriesRouter);
  router.use('/requests', requestsRouter);
}
