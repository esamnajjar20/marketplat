import { z } from 'zod';
import { optionalQueryNumber } from '../../../shared/http/queryHelpers';
import {
  NOTIFICATION_CATEGORY_TYPES,
  notificationCategorySchema,
  notificationTypeSchema,
  optionalQueryBooleanSchema,
} from '@marketplat/contracts';
import type { NotificationCategory } from '@marketplat/contracts';

const optionalQueryBoolean = optionalQueryBooleanSchema;

/** Shared notification enums and category mappings are the canonical contract. */
export { NOTIFICATION_CATEGORY_TYPES };
export type { NotificationCategory };
const notificationTypeEnum = notificationTypeSchema;

export const getNotificationsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    unreadOnly: optionalQueryBoolean,
    /** فلتر نوع واحد */
    type: notificationTypeEnum.optional(),
    /** All shared categories (including following and sales) map to type sets. */
    category: notificationCategorySchema.optional(),
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
    endpoint: z.string().url().max(2048),
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

// unregisterFcmTokenSchema was a
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
