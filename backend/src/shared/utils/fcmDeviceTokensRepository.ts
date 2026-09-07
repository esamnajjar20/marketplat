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
}

export const fcmDeviceTokensRepository = {
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
      create: { userId: input.userId, token: input.token, platform: input.platform },
      update: { platform: input.platform },
    }),

  deleteForUser: (userId: string, token: string): Promise<Prisma.BatchPayload> =>
    prisma.fcmDeviceToken.deleteMany({ where: { userId, token } }),

  // Used by fcmPushService.ts to prune tokens FCM has permanently
  // rejected (uninstall, app data cleared, token expired) — same
  // pattern as pushSubscriptionsRepository.deleteByEndpoints.
  deleteByTokens: (tokens: string[]): Promise<Prisma.BatchPayload> =>
    prisma.fcmDeviceToken.deleteMany({ where: { token: { in: tokens } } }),
};
