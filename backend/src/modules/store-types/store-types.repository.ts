import { prisma } from '../../config/prisma';
import { Prisma, StoreType } from '@prisma/client';
import {
  CreateStoreTypeInput,
  UpdateStoreTypeInput,
  StoreTypeLabels,
} from './store-types.validation';

const DEFAULT_PRESENTATION = {
  card: { title: 'متجر', subtitle: '', products: 'المنتجات', offers: 'العروض', collections: 'المجموعات', ads: 'الإعلانات', reviews: 'التقييمات', about: 'عن المتجر', details: 'التفاصيل', contact: 'التواصل', location: 'الموقع' },
  page: { title: 'متجر', subtitle: '', products: 'المنتجات', offers: 'العروض', collections: 'المجموعات', ads: 'الإعلانات', reviews: 'التقييمات', about: 'عن المتجر', details: 'التفاصيل', contact: 'التواصل', location: 'الموقع' },
} as const;

export type StoreTypeWithCount = StoreType & { _count: { stores: number } };

export type StoreTypePublic = Pick<
  StoreType,
  'id' | 'slug' | 'nameAr' | 'icon' | 'labels' | 'presentation'
> & { hasActiveStores: boolean };

export const storeTypesRepository = {
  findActive: async (): Promise<StoreTypeWithCount[]> =>
    prisma.storeType.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            stores: {
              where: { status: 'ACTIVE', sellerProfile: { suspended: false } },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    }),

  findById: (id: string): Promise<StoreType | null> =>
    prisma.storeType.findUnique({ where: { id } }),

  findBySlug: (slug: string): Promise<StoreType | null> =>
    prisma.storeType.findUnique({ where: { slug } }),

  findAllForAdmin: (): Promise<StoreType[]> =>
    prisma.storeType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    }),

  create: (input: CreateStoreTypeInput): Promise<StoreType> =>
    prisma.storeType.create({
      data: {
        id: `st_${input.slug}`,
        slug: input.slug,
        nameAr: input.nameAr,
        icon: input.icon,
        labels: input.labels as Prisma.InputJsonValue,
        presentation: (input.presentation ?? DEFAULT_PRESENTATION) as Prisma.InputJsonValue,
        freeProductLimit: input.freeProductLimit ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    }),

  update: (id: string, input: UpdateStoreTypeInput): Promise<StoreType> =>
    prisma.storeType.update({
      where: { id },
      data: {
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.labels !== undefined ? { labels: input.labels as Prisma.InputJsonValue } : {}),
        ...(input.presentation !== undefined ? { presentation: input.presentation as Prisma.InputJsonValue } : {}),
        ...(input.freeProductLimit !== undefined ? { freeProductLimit: input.freeProductLimit } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    }),

  setActive: (id: string, isActive: boolean): Promise<StoreType> =>
    prisma.storeType.update({ where: { id }, data: { isActive } }),
};
