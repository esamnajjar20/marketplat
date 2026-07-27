import { prisma } from '../../src/config/prisma';
import { Ad } from '@prisma/client';

export const createTestAd = async (
  userId: string,
  overrides?: Partial<{
    title: string;
    description: string;
    price: number;
    city: string;
    categoryId: string;
    views: number;
  }>
): Promise<Ad> =>
  prisma.ad.create({
    data: {
      title: overrides?.title ?? 'Test Ad Title',
      description: overrides?.description ?? 'Test ad description with enough characters here',
      price: overrides?.price ?? 100,
      images: [],
      city: overrides?.city ?? 'الرياض',
      userId,
      ...(overrides?.categoryId && { categoryId: overrides.categoryId }),
      ...(overrides?.views !== undefined && { views: overrides.views }),
    },
  });
