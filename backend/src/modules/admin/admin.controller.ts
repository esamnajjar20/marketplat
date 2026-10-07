import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { notificationsService } from '../notifications';
import { successResponse } from '../../shared/types/api-response.types';
import { runBulk } from '../../shared/utils/bulkRunner';
import {
  adminGetAdsSchema,
  adminGetUsersSchema,
  adminGetProductsSchema,
  adminGetServiceListingsSchema,
  adminGetOpenRequestsSchema,
  setFeaturedSchema,
  setPinnedSchema,
  toggleActiveSchema,
  changeRoleSchema,
  setProductStatusSchema,
  setServiceListingStatusSchema,
  deleteAdSchema,
  bulkSetAdFeaturedSchema,
  bulkSetAdPinnedSchema,
  bulkDeleteAdsSchema,
  bulkToggleUserActiveSchema,
  adminGetServiceRequestDisputesSchema,
  adminResolveServiceRequestDisputeSchema,
} from './admin.validation';
import { broadcastNotificationSchema } from '../notifications/notifications.validation';
import { requireUser } from '../../shared/utils/requireUser';
import { getClientIp } from '../../shared/utils/getClientIp';
import { Role } from '../../shared/constants/roles';

/** Same convention as auth.controller.ts's own local getUserAgent —
 * kept inline here too rather than shared, since it's a one-line
 * header read with no other logic. */
const getUserAgent = (req: Request): string => req.headers['user-agent'] ?? 'unknown';

export const adminController = {
  /**
   * GET /admin/stats — replaces the frontend's previous
   * three-separate-requests workaround in useAdminStats().
   */
  getStats: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await adminService.getStats();
      res.status(200).json(successResponse('Stats fetched', stats));
    } catch (error) {
      next(error);
    }
  },


  getAdminProducts: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetProductsSchema.parse({ query: req.query });
      const result = await adminService.getAdminProducts(query);
      res.status(200).json(successResponse('Products fetched', result.items, {
        pagination: result.meta,
      }));
    } catch (error) {
      next(error);
    }
  },

  setProductStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = setProductStatusSchema.parse({ body: req.body });
      const product = await adminService.setProductStatus(
        req.params.id,
        body.status,
        user.userId,
        body.reason,
      );
      res.status(200).json(successResponse('Product status updated', product));
    } catch (error) {
      next(error);
    }
  },

  getAdminServiceListings: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetServiceListingsSchema.parse({ query: req.query });
      const result = await adminService.getAdminServiceListings(query);
      res.status(200).json(successResponse('Service listings fetched', result.items, {
        pagination: result.meta,
      }));
    } catch (error) {
      next(error);
    }
  },

  setServiceListingStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = setServiceListingStatusSchema.parse({ body: req.body });
      const listing = await adminService.setServiceListingStatus(
        req.params.id,
        body.status,
        user.userId,
        body.reason,
      );
      res.status(200).json(successResponse('Service listing status updated', listing));
    } catch (error) {
      next(error);
    }
  },




  getServiceRequestDisputes: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetServiceRequestDisputesSchema.parse({ query: req.query });
      const result = await adminService.getServiceRequestDisputes(query);
      res.status(200).json(successResponse('Service request disputes fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  resolveServiceRequestDispute: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = adminResolveServiceRequestDisputeSchema.parse({ params: req.params, body: req.body });
      const result = await adminService.resolveServiceRequestDispute(params.id, user.userId, body.resolution, body.note);
      res.status(200).json(successResponse('Service request dispute resolved', result));
    } catch (error) {
      next(error);
    }
  },

  getAdminOpenRequests: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetOpenRequestsSchema.parse({ query: req.query });
      const result = await adminService.getAdminOpenRequests(query);
      res.status(200).json(successResponse('Open requests fetched', result.items, {
        pagination: result.meta,
      }));
    } catch (error) {
      next(error);
    }
  },

  adminCancelOpenRequest: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      const row = await adminService.adminCancelOpenRequest(req.params.id, user.userId, reason);
      res.status(200).json(successResponse('Request cancelled', row));
    } catch (error) {
      next(error);
    }
  },

  getPlatformTrends: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // ADMIN-DAYS-VALIDATION-01: was raw Number() — ?days=abc became
      // NaN and flowed into the SQL interval, ?days=999999 produced a
      // year-scale scan. Clamp to a sane window; anything invalid falls
      // back to the default.
      const rawDays = Number(req.query.days);
      const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 365
        ? rawDays
        : 30;
      const result = await adminService.getPlatformTrends(days);
      res.status(200).json(successResponse('Platform trends', result));
    } catch (error) {
      next(error);
    }
  },

  getSystemHealth: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await adminService.getSystemHealth();
      res.status(200).json(successResponse('System health', result));
    } catch (error) {
      next(error);
    }
  },

  exportUsersCsv: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const csv = await adminService.exportUsersCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  exportReportsCsv: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const csv = await adminService.exportReportsCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },
  getOpsQueue: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queue = await adminService.getOpsQueue();
      res.status(200).json(successResponse('Ops queue fetched', queue));
    } catch (error) {
      next(error);
    }
  },

  getAllAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetAdsSchema.parse({ query: req.query });
      const result = await adminService.getAllAds(query);
      res
        .status(200)
        .json(successResponse('Ads fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  setAdFeatured: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = setFeaturedSchema.parse({ body: req.body });
      const ad = await adminService.setAdFeatured(req.params.id, body.isFeatured, admin.userId);
      res
        .status(200)
        .json(successResponse(`Ad ${body.isFeatured ? 'featured' : 'unfeatured'}`, ad));
    } catch (error) {
      next(error);
    }
  },

  setAdPinned: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = setPinnedSchema.parse({ body: req.body });
      const ad = await adminService.setAdPinned(req.params.id, body.isPinned, admin.userId);
      res.status(200).json(successResponse(`Ad ${body.isPinned ? 'pinned' : 'unpinned'}`, ad));
    } catch (error) {
      next(error);
    }
  },

  deleteAd: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = deleteAdSchema.parse({ body: req.body ?? {} });
      await adminService.forceDeleteAd(req.params.id, admin.userId, body.reason);
      res.status(200).json(successResponse('Ad deleted by admin'));
    } catch (error) {
      next(error);
    }
  },

  // BULK-ADMIN (item 17): each of these three calls the exact same
  // single-item service function (setAdFeatured/setAdPinned/
  // forceDeleteAd) once per id via runBulk — see bulkRunner.ts's doc
  // comment for why that (not a repository updateMany) is the point.
  // 200 even when `failed` is non-empty: this is a partial-success
  // shape, not a request-level error.
  bulkSetAdFeatured: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkSetAdFeaturedSchema.parse({ body: req.body });
      const result = await runBulk(body.adIds, (id) =>
        adminService.setAdFeatured(id, body.isFeatured, admin.userId)
      );
      res.status(200).json(
        successResponse('Bulk ad featured update processed', result.updated, {
          updatedCount: result.updated.length,
          failed: result.failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  bulkSetAdPinned: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkSetAdPinnedSchema.parse({ body: req.body });
      const result = await runBulk(body.adIds, (id) =>
        adminService.setAdPinned(id, body.isPinned, admin.userId)
      );
      res.status(200).json(
        successResponse('Bulk ad pinned update processed', result.updated, {
          updatedCount: result.updated.length,
          failed: result.failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  bulkDeleteAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkDeleteAdsSchema.parse({ body: req.body });
      // forceDeleteAd resolves to void on success — runBulk's `updated`
      // array is only used for its length/count here, not its
      // contents, so a bare per-id success marker is enough.
      const result = await runBulk(body.adIds, async (id) => {
        await adminService.forceDeleteAd(id, admin.userId, body.reason);
        return id;
      });
      res.status(200).json(
        successResponse('Bulk ad deletion processed', result.updated, {
          updatedCount: result.updated.length,
          failed: result.failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  getAllUsers: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = adminGetUsersSchema.parse({ query: req.query });
      const result = await adminService.getAllUsers(query);
      res
        .status(200)
        .json(successResponse('Users fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  toggleUserActive: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = toggleActiveSchema.parse({ body: req.body });
      const user = await adminService.toggleUserActive(
        req.params.id,
        body.isActive,
        admin.userId,
        admin.role as Role
      );
      res
        .status(200)
        .json(successResponse(`User ${body.isActive ? 'activated' : 'deactivated'}`, user));
    } catch (error) {
      next(error);
    }
  },

  // BULK-ADMIN (item 17): calls adminService.toggleUserActive once per
  // id via runBulk — this reuses that function's existing rank check
  // (canManageRole), self-deactivation guard, and last-active-admin/
  // super-admin guards exactly as-is per id. A batch that includes a
  // user the actor isn't allowed to touch, or the actor's own id, or
  // the last active admin, fails that one id (reported in `failed`)
  // without blocking the rest of the batch — same partial-success
  // shape as bulkSetAdFeatured etc.
  bulkToggleUserActive: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = bulkToggleUserActiveSchema.parse({ body: req.body });
      // Sequential (not Promise.allSettled / runBulk): toggleUserActive
      // wraps its read+guard+write in a Serializable transaction. Running
      // those concurrently for a multi-id batch races Postgres's SSI and
      // surfaces as P2034 on all-but-one of the ids — which is exactly
      // what made the bulk-deactivate integration test see updatedCount=1
      // for a two-user batch. Sequential keeps the same per-id auth
      // guards/audit path while avoiding the conflict.
      const updated: Awaited<ReturnType<typeof adminService.toggleUserActive>>[] = [];
      const failed: { id: string; reason: string }[] = [];
      for (const id of body.userIds) {
        try {
          updated.push(
            await adminService.toggleUserActive(
              id,
              body.isActive,
              admin.userId,
              admin.role as Role,
            ),
          );
        } catch (err) {
          failed.push({
            id,
            reason: err instanceof Error ? err.message : 'Update failed',
          });
        }
      }
      res.status(200).json(
        successResponse('Bulk user status update processed', updated, {
          updatedCount: updated.length,
          failed,
        })
      );
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /admin/users/:id/role */
  changeRole: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = changeRoleSchema.parse({ body: req.body });
      const user = await adminService.changeRole(
        req.params.id,
        body.role,
        admin.userId,
        admin.role as Role,
        getClientIp(req),
        getUserAgent(req)
      );
      res.status(200).json(successResponse('User role updated', user));
    } catch (error) {
      next(error);
    }
  },

  /**
   * Epic 6: POST /admin/notifications/broadcast — the only trigger for
   * PROMOTION notifications; see notifications.service.ts's
   * broadcastPromotion doc comment. `allUsers: true` resolves to every
   * active user id via adminService.getAllActiveUserIds instead of
   * requiring the caller to enumerate them — `userIds` is still
   * required by the schema even in that case, but is ignored in favor
   * of the resolved list when allUsers is set.
   */
  broadcastNotification: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = broadcastNotificationSchema.parse({ body: req.body });
      const userIds = body.allUsers ? await adminService.getAllActiveUserIds() : body.userIds;
      const count = await notificationsService.broadcastPromotion(userIds, body.title, body.body);
      res.status(200).json(successResponse('Broadcast sent', { recipientCount: count }));
    } catch (error) {
      next(error);
    }
  },
};
