import { prisma } from '../../src/config/prisma';
import { SellerProfile } from '@prisma/client';

export const createTestSellerProfile = async (
  userId: string,
  overrides?: Partial<{
    displayName: string;
    suspended: boolean;
    verified: boolean;
  }>
): Promise<SellerProfile> =>
  prisma.sellerProfile.create({
    data: {
      userId,
      displayName: overrides?.displayName ?? 'Test Seller',
      suspended: overrides?.suspended ?? false,
      verified: overrides?.verified ?? false,
    },
  });
