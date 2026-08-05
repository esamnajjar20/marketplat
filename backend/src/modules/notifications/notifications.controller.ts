import { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import {
  getNotificationsSchema,
  notificationIdSchema,
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
} from './notifications.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const notificationsController = {
  getMyNotifications: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getNotificationsSchema.parse({ query: req.query });
      const result = await notificationsService.getMyNotifications(user.userId, query);
      res
        .status(200)
        .json(successResponse('Notifications fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getUnreadCount: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const count = await notificationsService.getUnreadCount(user.userId);
      res.status(200).json(successResponse('Unread count fetched', { count }));
    } catch (error) {
      next(error);
    }
  },

  markRead: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = notificationIdSchema.parse({ params: req.params });
      await notificationsService.markRead(user.userId, params.id);
      res.status(200).json(successResponse('Notification marked as read'));
    } catch (error) {
      next(error);
    }
  },

  markAllRead: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const count = await notificationsService.markAllRead(user.userId);
      res.status(200).json(successResponse('All notifications marked as read', { count }));
    } catch (error) {
      next(error);
    }
  },

  /** FIX PWA-PUSH-01: POST /notifications/push-subscriptions — frontend's
   * lib/pwa.ts subscribeToPush() calls this immediately after
   * pushManager.subscribe() resolves, passing subscription.toJSON()
   * as the body verbatim. */
  subscribeToPush: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createPushSubscriptionSchema.parse({ body: req.body });
      await notificationsService.subscribeToPush(user.userId, body);
      res.status(201).json(successResponse('Push subscription saved'));
    } catch (error) {
      next(error);
    }
  },

  /** FIX PWA-PUSH-01: DELETE /notifications/push-subscriptions — frontend's
   * unsubscribeFromPush() calls this after unsubscribing locally,
   * best-effort (see its own .catch()), so this endpoint's job is just
   * to clean up the server-side row if it exists. */
  unsubscribeFromPush: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = deletePushSubscriptionSchema.parse({ body: req.body });
      await notificationsService.unsubscribeFromPush(user.userId, body.endpoint);
      res.status(200).json(successResponse('Push subscription removed'));
    } catch (error) {
      next(error);
    }
  },
};
