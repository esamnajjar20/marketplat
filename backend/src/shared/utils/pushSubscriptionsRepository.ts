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
  /** Default device label for a NEW row only (see deviceLabel.ts). */
  defaultLabel?: string | null;
}

export const pushSubscriptionsRepository = {
  findManyByUserId: (userId: string): Promise<PushSubscription[]> =>
    prisma.pushSubscription.findMany({ where: { userId } }),

  // Queue jobs carry the row id (never the endpoint/keys — those are
  // credentials and must not sit in Redis). userId is checked too so a stale
  // job can never deliver to a row that has since moved to another account
  // (PUSH-OWNERSHIP-01 reassigns rows between users on shared devices).
  findByIdForUser: (id: string, userId: string): Promise<PushSubscription | null> =>
    prisma.pushSubscription.findFirst({ where: { id, userId } }),

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
        label: input.defaultLabel ?? null,
      },
      // PUSH-OWNERSHIP-01: the endpoint is a secret URL only the device's
      // browser holds, so a successful authenticated POST proves the
      // *current* session controls that device. On a shared device
      // (user A logs out, user B logs in) the row must follow the
      // device — keeping A's userId meant B never received anything and
      // A kept receiving B's-device pushes.
      // `label` is deliberately absent: a user-chosen name survives re-registration.
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        lastSeenAt: new Date(),
      },
    }),

  // ── Device list ───────────────────────────────────────────────────
  // All three are scoped by userId in the WHERE clause (ownership-in-the-
  // query, like deleteForUser) so an id guessed from another account is a no-op.
  listForUser: (userId: string): Promise<PushSubscription[]> =>
    prisma.pushSubscription.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } }),

  renameForUser: (userId: string, id: string, label: string): Promise<Prisma.BatchPayload> =>
    prisma.pushSubscription.updateMany({ where: { id, userId }, data: { label } }),

  deleteByIdForUser: (userId: string, id: string): Promise<Prisma.BatchPayload> =>
    prisma.pushSubscription.deleteMany({ where: { id, userId } }),

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
