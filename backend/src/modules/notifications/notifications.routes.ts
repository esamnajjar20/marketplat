import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const notificationsRouter = Router();

// All routes are the caller's own notifications only — no id-scoped
// GET exists (nothing needs to fetch a single notification by id
// outside the list), matching the bell/dropdown UI's actual needs.
notificationsRouter.get('/', authenticate, CACHE.NONE, notificationsController.getMyNotifications);
notificationsRouter.get(
  '/unread-count',
  authenticate,
  CACHE.NONE,
  notificationsController.getUnreadCount
);
notificationsRouter.patch('/:id/read', authenticate, notificationsController.markRead);
notificationsRouter.patch('/read-all', authenticate, notificationsController.markAllRead);
