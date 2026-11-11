import { prisma } from '../../config/prisma';
import { Prisma, FcmDeviceToken } from '@prisma/client';

/**
 * NEW — mirrors pushSubscriptionsRepository.ts's shape exactly (same
 * "single repository-layer owner per model" convention documented in
 * that file's header): centralizes all prisma.fcmDeviceToken access
 * here rather than letting the service and the push-sender each talk
 * to prisma directly.
 */
export interface UpsertFcmDeviceTokenInput {
  userId: string;
  token: string;
  platform: string;
  /** Default device label for a NEW row only (see deviceLabel.ts). */
  defaultLabel?: string | null;
}

export const fcmDeviceTokensRepository = {
  // See pushSubscriptionsRepository.findByIdForUser — jobs carry ids, not tokens.
  findByIdForUser: (id: string, userId: string): Promise<FcmDeviceToken | null> =>
    prisma.fcmDeviceToken.findFirst({ where: { id, userId } }),

  findManyByUserId: (userId: string): Promise<FcmDeviceToken[]> =>
    prisma.fcmDeviceToken.findMany({ where: { userId } }),

  // Same rationale as pushSubscriptionsRepository.upsert: `token` is
  // globally unique per device/installation, so re-registering (app
  // reopen, FCM token refresh) updates the existing row instead of
  // erroring on the unique constraint or duplicating it. Deliberately
  // does not touch userId on update, for the same reason as
  // PushSubscription: a token belonging to one user's device can't be
  // silently reassigned to whoever happens to re-register it.
  upsert: (input: UpsertFcmDeviceTokenInput): Promise<FcmDeviceToken> =>
    prisma.fcmDeviceToken.upsert({
      where: { token: input.token },
      create: {
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        label: input.defaultLabel ?? null,
      },
      // PUSH-OWNERSHIP-01: same device-follows-current-session rule as
      // pushSubscriptionsRepository.upsert (FCM token is per-installation).
      // `label` is deliberately absent: a user-chosen name survives re-registration.
      update: { userId: input.userId, platform: input.platform, lastSeenAt: new Date() },
    }),

  // ── Device list — same ownership-in-the-WHERE shape as the web-push repo. ──
  listForUser: (userId: string): Promise<FcmDeviceToken[]> =>
    prisma.fcmDeviceToken.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } }),

  renameForUser: (userId: string, id: string, label: string): Promise<Prisma.BatchPayload> =>
    prisma.fcmDeviceToken.updateMany({ where: { id, userId }, data: { label } }),

  deleteByIdForUser: (userId: string, id: string): Promise<Prisma.BatchPayload> =>
    prisma.fcmDeviceToken.deleteMany({ where: { id, userId } }),

  deleteForUser: (userId: string, token: string): Promise<Prisma.BatchPayload> =>
    prisma.fcmDeviceToken.deleteMany({ where: { userId, token } }),

  // Used by fcmPushService.ts to prune tokens FCM has permanently
  // rejected (uninstall, app data cleared, token expired) — same
  // pattern as pushSubscriptionsRepository.deleteByEndpoints.
  // an empty `in` array is a
  // full-table delete in some ORMs and a no-op in others — Prisma
  // happens to treat it as "match nothing", but that's implicit
  // behavior that shouldn't be relied on. Callers already guard with
  // `if (tokens.length > 0)`, and this explicit early return makes the
  // contract local to the repository so a future caller can't
  // accidentally wipe every row with an empty list.
  deleteByTokens: async (tokens: string[]): Promise<Prisma.BatchPayload> => {
    if (tokens.length === 0) return { count: 0 };
    return prisma.fcmDeviceToken.deleteMany({ where: { token: { in: tokens } } });
  },
};
