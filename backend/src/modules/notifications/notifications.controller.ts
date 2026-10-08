import { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import {
  getNotificationsSchema,
  notificationIdSchema,
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
  registerFcmTokenSchema,
  deleteFcmTokenSchema,
  deviceParamsSchema,
  renameDeviceSchema,
} from './notifications.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { addNotificationStreamClient } from '../../shared/utils/notificationStream';

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

  markUnread: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = notificationIdSchema.parse({ params: req.params });
      await notificationsService.markUnread(user.userId, params.id);
      res.status(200).json(successResponse('Notification marked as unread'));
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

  /** POST /notifications/push-subscriptions — frontend's
   * lib/pwa.ts subscribeToPush() calls this immediately after
   * pushManager.subscribe() resolves, passing subscription.toJSON()
   * as the body verbatim. */
  subscribeToPush: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createPushSubscriptionSchema.parse({ body: req.body });
      await notificationsService.subscribeToPush(user.userId, body, req.headers['user-agent']);
      res.status(201).json(successResponse('Push subscription saved'));
    } catch (error) {
      next(error);
    }
  },

  /** DELETE /notifications/push-subscriptions — frontend's
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

  /** POST /notifications/push-test — see notificationsService.sendTestPush. */
  sendTestPush: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const result = await notificationsService.sendTestPush(user.userId);
      res.status(200).json(successResponse('Test push processed', result));
    } catch (error) {
      next(error);
    }
  },

  /** NEW — POST /notifications/fcm-tokens, called from the Capacitor
   * shell's lib/capacitor/nativePush.ts registerNativePush() right
   * after PushNotifications.register() resolves a device token. */
  registerFcmToken: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = registerFcmTokenSchema.parse({ body: req.body });
      await notificationsService.registerFcmToken(user.userId, body);
      res.status(201).json(successResponse('Device registered for push'));
    } catch (error) {
      next(error);
    }
  },

  /** NEW — DELETE /notifications/fcm-tokens, mirrors unsubscribeFromPush above. */
  unregisterFcmToken: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = deleteFcmTokenSchema.parse({ body: req.body });
      await notificationsService.unregisterFcmToken(user.userId, body.token);
      res.status(200).json(successResponse('Device unregistered from push'));
    } catch (error) {
      next(error);
    }
  },

  /** GET /notifications/devices */
  listDevices: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const devices = await notificationsService.listDevices(user.userId);
      res.status(200).json(successResponse('Devices fetched', devices));
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /notifications/devices/:kind/:id */
  renameDevice: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = renameDeviceSchema.parse({ params: req.params, body: req.body });
      await notificationsService.renameDevice(user.userId, params.kind, params.id, body.label);
      res.status(200).json(successResponse('Device renamed'));
    } catch (error) {
      next(error);
    }
  },

  /** DELETE /notifications/devices/:kind/:id */
  removeDevice: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = deviceParamsSchema.parse({ params: req.params });
      await notificationsService.removeDevice(user.userId, params.kind, params.id);
      res.status(200).json(successResponse('Device removed'));
    } catch (error) {
      next(error);
    }
  },

  deleteNotification: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = notificationIdSchema.parse({ params: req.params });
      await notificationsService.deleteNotification(user.userId, params.id);
      res.status(200).json(successResponse('Notification deleted'));
    } catch (error) {
      next(error);
    }
  },

  deleteAllRead: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const count = await notificationsService.deleteAllRead(user.userId);
      res.status(200).json(successResponse('Read notifications deleted', { count }));
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /notifications/stream — Server-Sent Events.
   * Requires Authorization: Bearer (EventSource cannot set headers, so the
   * frontend uses fetch + ReadableStream instead).
   */
  stream: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      // Resume point: native EventSource sends Last-Event-ID itself; the app's
      // fetch-based client sets the header (or ?lastEventId= as a fallback).
      const fromQuery = typeof req.query.lastEventId === 'string' ? req.query.lastEventId : undefined;
      const lastEventId = req.get('last-event-id') ?? fromQuery;
      addNotificationStreamClient(user.userId, res, { lastEventId });
      // Keep the request open; cleanup is on res 'close'.
    } catch (error) {
      next(error);
    }
  },
};
