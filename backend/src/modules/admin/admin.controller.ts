import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { notificationsService } from '../notifications';
import { successResponse } from '../../shared/types/api-response.types';
import {
  adminGetAdsSchema,
  adminGetUsersSchema,
  setFeaturedSchema,
  setPinnedSchema,
  toggleActiveSchema,
  changeRoleSchema,
} from './admin.validation';
import { broadcastNotificationSchema } from '../notifications/notifications.validation';
import { requireUser } from '../../shared/utils/requireUser';

export const adminController = {
  /**
   * FIX FEAT-05: GET /admin/stats — replaces the frontend's previous
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
      await adminService.forceDeleteAd(req.params.id, admin.userId);
      res.status(200).json(successResponse('Ad deleted by admin'));
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
      const user = await adminService.toggleUserActive(req.params.id, body.isActive, admin.userId);
      res
        .status(200)
        .json(successResponse(`User ${body.isActive ? 'activated' : 'deactivated'}`, user));
    } catch (error) {
      next(error);
    }
  },

  /** FIX AUDIT-V3-05: PATCH /admin/users/:id/role */
  changeRole: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { body } = changeRoleSchema.parse({ body: req.body });
      const user = await adminService.changeRole(req.params.id, body.role, admin.userId);
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
