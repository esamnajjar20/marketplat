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

// FIX PWA-PUSH-01: mirrors the browser PushSubscription.toJSON() shape
// exactly (endpoint + nested keys.p256dh/keys.auth) — see
// notifications.repository.ts's PushSubscriptionInput doc comment for
// why the nesting is kept rather than flattened. endpoint has no fixed
// format across push services (FCM/autopush/etc. URLs vary in length
// and structure) so it's validated as a URL and length-capped to match
// the schema column (@db.VarChar(1000)) rather than pattern-matched.
export const createPushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export type CreatePushSubscriptionInput = z.infer<typeof createPushSubscriptionSchema>['body'];

// DELETE carries its endpoint in the request body (not a URL param)
// since the endpoint is itself a full URL — the frontend already sends
// it this way (see lib/pwa.ts's unsubscribeFromPush, which calls
// apiClient.delete('/notifications/push-subscriptions', { data: { endpoint } })).
export const deletePushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url().max(1000),
  }),
});

export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>['body'];
