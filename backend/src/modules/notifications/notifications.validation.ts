import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

const optionalQueryBoolean = z.preprocess(
  (value) => (value === undefined ? undefined : value === 'true' || value === true),
  z.boolean().optional()
);

/** أنواع Prisma NotificationType — تُبقى متوافقة مع الـ enum في schema. */
// FIX NOTIF-TYPE-ENUM-SYNC-01: this enum was out of sync with
// schema.prisma's NotificationType and with the types actually
// produced by notifications.service.ts. Four were missing:
//   - NEW_REQUEST_OFFER / REQUEST_OFFER_ACCEPTED — created by the
//     Open Requests marketplace flow, so ?type=NEW_REQUEST_OFFER
//     returned a 400 ("Invalid enum value") instead of the user's
//     offers.
//   - WEEKLY_STORE_VIEWS_REPORT / WEEKLY_SERVICE_VIEWS_REPORT —
//     written by the weekly report scripts, same 400 on filter.
// Kept in the same order as schema.prisma's enum for visual diffing.
const notificationTypeEnum = z.enum([
  'NEW_MESSAGE',
  'FAV_AD_PRICE_CHANGED',
  'FAV_AD_SOLD',
  'PROMOTION',
  'WEEKLY_AD_VIEWS_REPORT',
  'WEEKLY_STORE_VIEWS_REPORT',
  'WEEKLY_SERVICE_VIEWS_REPORT',
  'SAVED_SEARCH_MATCH',
  'PROMOTION_STATUS_CHANGE',
  'STORE_NEW_PRODUCT',
  'STORE_PROMOTION_STARTED',
  'STORE_PRODUCT_RESTOCKED',
  'NEW_REQUEST_OFFER',
  'REQUEST_OFFER_ACCEPTED',
  'STORE_MEMBER_INVITED',
  'NEW_SERVICE_QUOTE',
  'SERVICE_QUOTE_ACCEPTED',
  'SERVICE_REQUEST_NEW',
  'SERVICE_REQUEST_UPDATE',
  'APPOINTMENT_UPDATE',
]);

/** فئة واجهة المستخدم → مجموعة أنواع (نفس تجميع الواجهة). */
export const NOTIFICATION_CATEGORY_TYPES = {
  messages: ['NEW_MESSAGE'],
  favorites: ['FAV_AD_PRICE_CHANGED', 'FAV_AD_SOLD', 'SAVED_SEARCH_MATCH'],
  stores: [
    'STORE_NEW_PRODUCT',
    'STORE_PROMOTION_STARTED',
    'STORE_PRODUCT_RESTOCKED',
    'PROMOTION_STATUS_CHANGE',
    'STORE_MEMBER_INVITED',
  ],
  // FIX NOTIF-TYPE-ENUM-SYNC-01: requests-marketplace events belong
  // under the 'services' UI category — a customer filtering their
  // notifications by 'services' should see an offer on their open
  // request. (T780 — service-broadcast quote types removed with the
  // ServiceBroadcast feature.)
  services: [
    'NEW_REQUEST_OFFER',
    'REQUEST_OFFER_ACCEPTED',
    'NEW_SERVICE_QUOTE',
    'SERVICE_QUOTE_ACCEPTED',
    'SERVICE_REQUEST_NEW',
    'SERVICE_REQUEST_UPDATE',
    'APPOINTMENT_UPDATE',
  ],
  system: [
    'PROMOTION',
    'WEEKLY_AD_VIEWS_REPORT',
    'WEEKLY_STORE_VIEWS_REPORT',
    'WEEKLY_SERVICE_VIEWS_REPORT',
  ],
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORY_TYPES;

export const getNotificationsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    unreadOnly: optionalQueryBoolean,
    /** فلتر نوع واحد */
    type: notificationTypeEnum.optional(),
    /**
     * فئة واجهة: messages | favorites | stores | services | system
     * تُحوَّل في الخدمة إلى قائمة types.
     */
    category: z
      .enum(['messages', 'favorites', 'stores', 'services', 'system'])
      .optional(),
  }),
});

export type GetNotificationsQuery = z.infer<typeof getNotificationsSchema>['query'];

export const notificationIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const broadcastNotificationSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().min(1)).min(1).max(10_000),
    allUsers: z.boolean().optional(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
  }),
});

export const deleteFcmTokenSchema = z.object({
  body: z.object({
    // PUSH-SCHEMA-MAXLEN-01: FCM tokens are ~163 chars in practice;
    // 1024 is generous. Uncapped, a single 10 MB token string landed
    // straight in Redis/Postgres.
    token: z.string().min(1).max(1024),
  }),
});

export const createPushSubscriptionSchema = z.object({
  body: z.object({
    // PUSH-SCHEMA-MAXLEN-01: see file's own note. Web Push endpoints
    // run ~200-500 chars depending on service. Capped at 1000 to match
    // push_subscriptions.endpoint VARCHAR(1000) — a longer value used to
    // pass validation and then fail at the DB as a 500. p256dh
    // is a base64-encoded 65-byte EC point (~88 chars), auth is
    // base64 of 16 bytes (~24). Both capped generously.
    endpoint: z.string().url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(64),
    }),
  }),
});

export const deletePushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().min(1).max(2048),
  }),
});

export const registerFcmTokenSchema = z.object({
  body: z.object({
    // PUSH-SCHEMA-ALIGN-01: fcm_device_tokens.token is VARCHAR(500) and
    // platform VARCHAR(20) — validation used to allow 1024/50, which
    // surfaced as DB errors (500) instead of 400. The client only ever
    // sends 'android' | 'ios' (lib/capacitor/nativePush.ts).
    token: z.string().min(1).max(500),
    platform: z.enum(['android', 'ios']),
  }),
});

// FIX NOTIF-VALIDATION-DEDUP-01: unregisterFcmTokenSchema was a
// byte-for-byte duplicate of deleteFcmTokenSchema (which is the one
// notifications.controller.ts actually imports). Removed.

// Device list (notification settings). `kind` selects which registration
// table the id belongs to — ids are cuids from two different tables.
export const deviceParamsSchema = z.object({
  params: z.object({
    kind: z.enum(['web', 'native']),
    id: z.string().min(1).max(64),
  }),
});

export const renameDeviceSchema = z.object({
  params: deviceParamsSchema.shape.params,
  body: z.object({
    label: z.string().trim().min(1).max(60),
  }),
});
