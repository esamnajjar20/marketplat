import type { Router } from 'express';
import { adminRouter } from '../modules/platform/admin';
import { analyticsRouter, analyticsAdminRouter } from '../modules/platform/analytics';
import { observabilityRouter } from '../modules/platform/observability';
import { mediaRouter } from '../modules/platform/media';
import { userSimulatorRouter } from '../modules/platform/user-simulator';

/**
 * Admin and operational surface. Registered BEFORE trust.routes.ts: the
 * /admin/* sub-routers there (audit-logs, fraud) must stay behind adminRouter.
 */
export function registerPlatformRoutes(router: Router): void {
  // Dedicated Playwright browser runner control plane; ADMIN+ only.
  router.use('/admin/user-simulator', userSimulatorRouter);
  router.use('/admin', adminRouter);
  // Gap #7 (product analytics): /analytics/events is public (see
  // analyticsRouter's own comment — anonymous traffic is most of a
  // marketplace's usage); /admin/analytics is the admin-only summary,
  // kept as its own router (not merged into adminRouter) for the same
  // reason auditLogsRouter sits outside admin.routes.ts — a distinct
  // repository-backed module, not raw Prisma calls in admin.service.ts.
  router.use('/analytics', analyticsRouter);
  router.use('/admin/analytics', analyticsAdminRouter);
  // receive side of the frontend's
  // reportClientError() pipeline. Public (no authenticate) and CSRF-
  // exempt — see observability.routes.ts's own comment for why. Sits
  // here next to /analytics because it is another public-write
  // beacon endpoint using the same rate limiter.
  router.use('/observability', observabilityRouter);
  router.use('/media', mediaRouter);
}
