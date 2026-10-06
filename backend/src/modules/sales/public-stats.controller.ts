import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { successResponse } from '../../shared/types/api-response.types';

export const publicSalesStatsController = {
  getStoreStats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.slug ?? '').trim();
      const store = await prisma.storeDetails.findUnique({ where: { slug }, include: { sellerProfile: { select: { userId: true, verified: true, averageRating: true, totalRatings: true } } } });
      if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store not found.', 'STORE_NOT_FOUND');
      const aggregate = await prisma.saleRecord.aggregate({ where: { storeId: store.id }, _count: { id: true }, _max: { soldAt: true } });
      res.json(successResponse('Public store sales stats fetched', {
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        ownerUserId: store.sellerProfile.userId,
        totalSales: aggregate._count.id,
        averageRating: Number(store.sellerProfile.averageRating),
        reviewCount: store.sellerProfile.totalRatings,
        verifiedSeller: store.sellerProfile.verified,
        lastSaleAt: aggregate._max.soldAt,
      }));
    } catch (e) { next(e); }
  },
};
