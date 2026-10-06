/**
 * SELLER-PIN — seller can pin ONE of their own ACTIVE ads.
 * Admin pins use pinnedByAdmin=true and must not be cleared by seller pin.
 */
import { AdStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';

export const adsPinService = {
  setPinned: async (userId: string, adId: string, isPinned: boolean) => {
    const ad = await prisma.ad.findUnique({ where: { id: adId } });
    if (!ad || ad.status === AdStatus.DELETED) {
      throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    }
    if (ad.userId !== userId) {
      throw new ForbiddenError('You can only pin your own ads.', 'NOT_YOUR_AD');
    }
    if (ad.status !== AdStatus.ACTIVE) {
      throw new BadRequestError('Only active ads can be pinned.', 'AD_NOT_ACTIVE');
    }

    if (!isPinned) {
      if (ad.pinnedByAdmin) {
        throw new ForbiddenError(
          'This ad was pinned by an admin and cannot be unpinned by the seller.',
          'ADMIN_PINNED',
        );
      }
      return prisma.ad.update({
        where: { id: adId },
        data: { isPinned: false, pinnedByAdmin: false },
      });
    }

    // two concurrent pin requests for
    // different ads owned by the same user could both pass the
    // "unpin everyone else" step (each saw the other's ad still
    // pinned-or-not in its own snapshot) and then both write
    // isPinned=true — leaving the user with two pinned ads despite
    // the single-pin rule. Serialized isolation makes Postgres detect
    // the read-write conflict and forces one to fail with P2034.
    // Same shape as admin.toggleUserActive's guard.
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.ad.updateMany({
            where: {
              userId,
              isPinned: true,
              pinnedByAdmin: false,
              id: { not: adId },
            },
            data: { isPinned: false },
          });
          await tx.ad.update({
            where: { id: adId },
            data: { isPinned: true, pinnedByAdmin: false },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2034'
      ) {
        throw new BadRequestError(
          'Another pin change happened at the same time — please retry.',
          'CONCURRENT_UPDATE_CONFLICT',
        );
      }
      throw e;
    }

    return prisma.ad.findUniqueOrThrow({ where: { id: adId } });
  },
};
