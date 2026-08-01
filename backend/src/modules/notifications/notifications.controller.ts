import { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import {
  getNotificationsSchema,
  notificationIdSchema,
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
};
