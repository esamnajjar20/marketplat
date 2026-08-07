import { prisma } from '../../config/prisma';
import { Prisma, PushSubscription } from '@prisma/client';

/**
 * AUDIT-FIX 2.6: pushService.ts (shared/utils) previously called
 * `prisma.pushSubscription.*` directly, bypassing
 * notifications.repository.ts even though that file already owns
 * upsertPushSubscription/deletePushSubscription for this exact model —
 * two independent code paths reading/writing the same table.
 *
 * The fix is NOT "make pushService import notifications.repository" —
 * every file under shared/utils/ in this codebase imports only from
 * shared/config/other shared/utils modules, never from modules/*
 * (checked: no exception anywhere else in shared/). Having
 * shared/utils/pushService.ts depend on modules/notifications would be
 * a new, backwards dependency direction not used anywhere else in this
 * project, and shared/ code is meant to be safely importable from any
 * module — depending back on one specific module breaks that.
 *
 * Instead, PushSubscription access is centralized here, in shared/utils
 * (alongside userCache.ts, unreadNotificationsCache.ts, etc. — other
 * single-model data-access helpers that live in shared/ because
 * multiple layers need them). Both pushService.ts and
 * notifications.repository.ts now call into this single place instead
 * of each talking to prisma.pushSubscription directly — one source of
 * truth for how this table is read and written, matching how every
 * other model in this project has exactly one repository-layer owner.
 */
export interface UpsertPushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export const pushSubscriptionsRepository = {
  findManyByUserId: (userId: string): Promise<PushSubscription[]> =>
    prisma.pushSubscription.findMany({ where: { userId } }),

  // FIX PWA-PUSH-01 (moved from notifications.repository.ts, same
  // upsert-on-endpoint rationale — endpoint is globally unique, see the
  // PushSubscription model's own doc comment in schema.prisma):
  // re-subscribing the same browser updates its existing row's keys
  // instead of erroring on the unique constraint or creating a
  // duplicate. update deliberately does NOT touch userId — an endpoint
  // belonging to one user's browser can't be silently reassigned to
  // whoever happens to re-subscribe it.
  upsert: (input: UpsertPushSubscriptionInput): Promise<PushSubscription> =>
    prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
      },
    }),

  // Scoped to userId so a caller can never delete someone else's
  // subscription by guessing/replaying an endpoint.
  deleteForUser: (userId: string, endpoint: string): Promise<Prisma.BatchPayload> =>
    prisma.pushSubscription.deleteMany({ where: { userId, endpoint } }),

  // Used by pushService.ts to prune subscriptions the push service has
  // permanently discarded (404/410 — see pushService.ts's isGoneError).
  // Not scoped to a single userId since a stale-endpoint cleanup batch
  // can span multiple recipients (pushService.notifyUsers' fan-out).
  deleteByEndpoints: (endpoints: string[]): Promise<Prisma.BatchPayload> =>
    prisma.pushSubscription.deleteMany({ where: { endpoint: { in: endpoints } } }),
};
