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

// FIX PWA-PUSH-01: matches the frontend's existing calls in lib/pwa.ts
// (POST on subscribe, DELETE with { endpoint } in the body on
// unsubscribe) — see notifications.controller.ts for both handlers.
notificationsRouter.post(
  '/push-subscriptions',
  authenticate,
  notificationsController.subscribeToPush
);
notificationsRouter.delete(
  '/push-subscriptions',
  authenticate,
  notificationsController.unsubscribeFromPush
);
