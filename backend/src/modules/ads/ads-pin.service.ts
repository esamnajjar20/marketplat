/**
 * SELLER-PIN — seller can pin ONE of their own ACTIVE ads.
 * Admin pins use pinnedByAdmin=true and must not be cleared by seller pin.
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

    await prisma.$transaction([
      prisma.ad.updateMany({
        where: {
          userId,
          isPinned: true,
          pinnedByAdmin: false,
          id: { not: adId },
        },
        data: { isPinned: false },
      }),
      prisma.ad.update({
        where: { id: adId },
        data: { isPinned: true, pinnedByAdmin: false },
      }),
    ]);

    return prisma.ad.findUniqueOrThrow({ where: { id: adId } });
  },
};
