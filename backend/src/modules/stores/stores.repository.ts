import { prisma } from '../../config/prisma';
import { Prisma, StoreDetails, StoreStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { GetStoresQuery } from './stores.validation';

export type StoreWithSeller = Prisma.StoreDetailsGetPayload<{
  include: { sellerProfile: true };
}>;

export type StoreWithSellerAndCounts = Prisma.StoreDetailsGetPayload<{
  include: {
    sellerProfile: true;
    _count: { select: { followers: true; products: true } };
  };
}>;

const storeWithSeller = { sellerProfile: true } as const;

const storeWithSellerAndCounts = {
  sellerProfile: true,
  _count: { select: { followers: true, products: true } },
} as const;

export const storesRepository = {
  findBySellerProfileId: (sellerProfileId: string): Promise<StoreDetails | null> =>
    prisma.storeDetails.findUnique({ where: { sellerProfileId } }),

  findById: (id: string): Promise<StoreDetails | null> =>
    prisma.storeDetails.findUnique({ where: { id } }),

  // FEAT-REPORT-USER-STORE: same query as findPublicById minus the
  // follower/product counts — reportsService only needs
  // sellerProfile.userId, not the full public-profile payload.
  findByIdWithSeller: (id: string): Promise<StoreWithSeller | null> =>
    prisma.storeDetails.findUnique({ where: { id }, include: storeWithSeller }),

  findPublicById: (id: string): Promise<StoreWithSellerAndCounts | null> =>
    prisma.storeDetails.findUnique({
      where: { id },
      include: storeWithSellerAndCounts,
    }),

  create: (
    tx: Prisma.TransactionClient,
    sellerProfileId: string,
    data: {
      name: string;
      description: string;
      city: string;
      address?: string;
      phone: string;
      logoUrl?: string;
      coverImageUrl?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<StoreDetails> =>
    tx.storeDetails.create({
      data: {
        sellerProfileId,
        name: data.name,
        description: data.description,
        city: data.city,
        address: data.address,
        phone: data.phone,
        logoUrl: data.logoUrl,
        coverImageUrl: data.coverImageUrl,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    }),

  update: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      city: string;
      address: string | null;
      phone: string;
      logoUrl: string | null;
      coverImageUrl: string | null;
      latitude: number | null;
      longitude: number | null;
    }>
  ): Promise<StoreDetails> => prisma.storeDetails.update({ where: { id }, data }),

  updateStatus: (id: string, status: 'PENDING' | 'ACTIVE' | 'BLOCKED'): Promise<StoreDetails> =>
    prisma.storeDetails.update({ where: { id }, data: { status } }),

  // Public store directory — only ACTIVE stores. Featured-plan stores
  // sort first (stores proposal's "ظهور أعلى" perk), then the
  // requested sort within each tier.
  findMany: async (
    query: GetStoresQuery
  ): Promise<{ stores: StoreWithSeller[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      city,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.StoreDetailsWhereInput = {
      status: 'ACTIVE',
      ...(city && { city }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [stores, total] = await Promise.all([
      prisma.storeDetails.findMany({
        where,
        include: storeWithSeller,
        orderBy: [{ plan: 'desc' }, { [sortBy]: sortOrder }],
        skip,
        take,
      }),
      prisma.storeDetails.count({ where }),
    ]);

    return { stores, total };
  },

  countActiveProducts: (storeId: string): Promise<number> =>
    prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),

  // Admin directory — unlike findMany (public, hardcoded to ACTIVE),
  // this surfaces every status so PENDING stores (the ones actually
  // needing action) and BLOCKED ones are visible too. Mirrors
  // sellersRepository.findMany/count's admin-facing shape.
  findManyForAdmin: async (params: {
    skip: number;
    take: number;
    status?: StoreStatus;
    q?: string;
  }): Promise<{ stores: StoreWithSeller[]; total: number }> => {
    const { skip, take, status, q } = params;
    const where: Prisma.StoreDetailsWhereInput = {
      ...(status && { status }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [stores, total] = await Promise.all([
      prisma.storeDetails.findMany({
        where,
        include: storeWithSeller,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.storeDetails.count({ where }),
    ]);

    return { stores, total };
  },
};
