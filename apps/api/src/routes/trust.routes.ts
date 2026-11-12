import type { Router } from 'express';
import { reportsRouter } from '../modules/trust/reports';
import { blockedUsersRouter } from '../modules/trust/blocked-users';
import { auditLogsRouter } from '../modules/trust/audit-logs';
import { fraudRouter } from '../modules/trust/fraud';

/**
 * Moderation and safety. The /admin/* mounts below depend on
 * platform.routes.ts having registered adminRouter first (see routes/index.ts).
 */
export function registerTrustRoutes(router: Router): void {
  router.use('/reports', reportsRouter);
  router.use('/blocked-users', blockedUsersRouter);
  // Own module (repository/service/controller/validation) mounted at
  // /admin/audit-logs — kept out of admin.routes.ts/admin.service.ts
  // (which talk to Prisma directly with no repository layer) so this
  // follows the same repository-backed module pattern as /reports,
  // which likewise sits outside admin.routes.ts despite being an
  // admin-only resource.
  router.use('/admin/audit-logs', auditLogsRouter);
  // Fraud detection (item 12 — "نظام مكافحة الاحتيال"): admin-only queue
  // for reviewing auto-flagged ads and the individual signals behind
  // them. Own repository-backed module mounted at /admin/fraud, same
  // pattern as /admin/audit-logs and /admin/analytics sitting outside
  // admin.routes.ts's raw-Prisma admin.service.ts.
  router.use('/admin/fraud', fraudRouter);
}
