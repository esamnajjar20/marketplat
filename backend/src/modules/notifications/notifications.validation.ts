import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

const optionalQueryBoolean = z.preprocess(
  (value) => (value === undefined ? undefined : value === 'true' || value === true),
  z.boolean().optional()
);

/** أنواع Prisma NotificationType — تُبقى متوافقة مع الـ enum في schema. */
const notificationTypeEnum = z.enum([
  'NEW_MESSAGE',
  'FAV_AD_PRICE_CHANGED',
  'FAV_AD_SOLD',
  'PROMOTION',
  'WEEKLY_AD_VIEWS_REPORT',
  'SAVED_SEARCH_MATCH',
  'PROMOTION_STATUS_CHANGE',
  'STORE_NEW_PRODUCT',
  'STORE_PROMOTION_STARTED',
  'STORE_PRODUCT_RESTOCKED',
  'NEW_SERVICE_QUOTE',
  'SERVICE_QUOTE_ACCEPTED',
  'STORE_MEMBER_INVITED',
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
  services: ['NEW_SERVICE_QUOTE', 'SERVICE_QUOTE_ACCEPTED'],
  system: ['PROMOTION', 'WEEKLY_AD_VIEWS_REPORT'],
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
    token: z.string().min(1),
  }),
});

export const createPushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export const deletePushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().min(1),
  }),
});

export const registerFcmTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    platform: z.string().min(1),
  }),
});

export const unregisterFcmTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1),
  }),
});
