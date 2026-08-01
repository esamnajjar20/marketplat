import { prisma } from '../../src/config/prisma';
import { StoreDetails, StoreStatus } from '@prisma/client';

export const createTestStore = async (
  sellerProfileId: string,
  overrides?: Partial<{
    name: string;
    description: string;
    city: string;
    address: string;
    phone: string;
    status: StoreStatus;
  }>
): Promise<StoreDetails> =>
  prisma.storeDetails.create({
    data: {
      sellerProfileId,
      name: overrides?.name ?? 'Test Store',
      description: overrides?.description ?? 'A perfectly fine store description here',
      city: overrides?.city ?? 'غزة',
      address: overrides?.address,
      phone: overrides?.phone ?? '0599111222',
      status: overrides?.status ?? 'ACTIVE',
    },
  });
