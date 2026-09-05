/**
 * TRACK-SELLER-PIN — seller can pin ONE of their own ACTIVE ads to the top
 * of their profile listing. Admin pin (isPinned via admin) remains separate
 * and is not cleared by seller unpin of a different ad.
 *
 * Rules:
 * - Owner only
 * - Ad must be ACTIVE
 * - At most one seller-pinned ad per user: pinning B unpins previous A
 * - Uses existing Ad.isPinned column (same flag admin uses; acceptable MVP)
 */
import { AdStatus } from '@prisma/client';
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
      return prisma.ad.update({
        where: { id: adId },
        data: { isPinned: false },
      });
    }

    // Pin this one and unpin any other of the same user (single-pin rule)
    await prisma.$transaction([
      prisma.ad.updateMany({
        where: { userId, isPinned: true, id: { not: adId } },
        data: { isPinned: false },
      }),
      prisma.ad.update({
        where: { id: adId },
        data: { isPinned: true },
      }),
    ]);

    return prisma.ad.findUniqueOrThrow({ where: { id: adId } });
  },
};
