import { prisma } from '../../src/config/prisma';
import { Category } from '@prisma/client';

export const createTestCategory = async (
  overrides?: Partial<{ name: string; nameAr: string; slug: string; parentId: string }>
): Promise<Category> => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return prisma.category.create({
    data: {
      name: overrides?.name ?? `Category ${unique}`,
      nameAr: overrides?.nameAr ?? `فئة ${unique}`,
      slug: overrides?.slug ?? `cat-${unique}`,
      ...(overrides?.parentId && { parentId: overrides.parentId }),
    },
  });
};
