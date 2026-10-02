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
notificationsRouter.get(
  '/stream',
  authenticate,
  CACHE.NONE,
  notificationsController.stream
);
notificationsRouter.patch('/read-all', authenticate, notificationsController.markAllRead);
notificationsRouter.delete('/read', authenticate, notificationsController.deleteAllRead);
notificationsRouter.patch('/:id/read', authenticate, notificationsController.markRead);
notificationsRouter.patch('/:id/unread', authenticate, notificationsController.markUnread);
notificationsRouter.delete('/:id', authenticate, notificationsController.deleteNotification);

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

notificationsRouter.post('/push-test', authenticate, notificationsController.sendTestPush);

// NEW — native (Capacitor/FCM) device-token registration, counterpart
// to the push-subscriptions pair above. See lib/capacitor/nativePush.ts.
notificationsRouter.post(
  '/fcm-tokens',
  authenticate,
  notificationsController.registerFcmToken
);
notificationsRouter.delete(
  '/fcm-tokens',
  authenticate,
  notificationsController.unregisterFcmToken
);

// Device list (Phase 2 UX) — the caller's own browser + native registrations.
// Three path segments for the id routes, so they cannot shadow '/:id/read'.
notificationsRouter.get('/devices', authenticate, CACHE.NONE, notificationsController.listDevices);
notificationsRouter.patch('/devices/:kind/:id', authenticate, notificationsController.renameDevice);
notificationsRouter.delete('/devices/:kind/:id', authenticate, notificationsController.removeDevice);
