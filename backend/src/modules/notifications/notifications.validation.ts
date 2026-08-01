import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

const optionalQueryBoolean = z.preprocess(
  (value) => (value === undefined ? undefined : value === 'true' || value === true),
  z.boolean().optional()
);

export const getNotificationsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    unreadOnly: optionalQueryBoolean,
  }),
});

export type GetNotificationsQuery = z.infer<typeof getNotificationsSchema>['query'];

export const notificationIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Notification ID is required') }),
});

// Admin-only broadcast — see notifications.service.ts's broadcastPromotion
// doc comment for why userIds is required rather than an implicit "all".
// allUsers is a controller-level shortcut (admin.controller.ts's
// broadcastNotification): when true, the resolved list of every active
// user id is used INSTEAD of userIds — userIds must still be present to
// satisfy this schema, but the frontend can send a 1-element placeholder
// array in that case since it's discarded.
export const broadcastNotificationSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().min(1)).min(1, 'At least one recipient is required').max(10_000),
    allUsers: z.boolean().optional(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
  }),
});

export type BroadcastNotificationInput = z.infer<typeof broadcastNotificationSchema>['body'];
