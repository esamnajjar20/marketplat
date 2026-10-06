import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { successResponse } from '../../shared/types/api-response.types';

export const publicSalesStatsController = {
  getStoreStats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.slug ?? '').trim();
      const store = await prisma.storeDetails.findUnique({ where: { slug }, include: { sellerProfile: { select: { verified: true, averageRating: true, totalRatings: true } } } });
      if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store not found.', 'STORE_NOT_FOUND');
      const aggregate = await prisma.saleRecord.aggregate({ where: { storeId: store.id }, _count: { id: true }, _sum: { totalPrice: true, refundedAmount: true }, _max: { soldAt: true } });
      res.json(successResponse('Public store sales stats fetched', {
        totalSales: aggregate._count.id,
        totalRevenue: Number(aggregate._sum.totalPrice ?? 0) - Number(aggregate._sum.refundedAmount ?? 0),
        averageRating: Number(store.sellerProfile.averageRating),
        reviewCount: store.sellerProfile.totalRatings,
        verifiedSeller: store.sellerProfile.verified,
        lastSaleAt: aggregate._max.soldAt,
      }));
    } catch (e) { next(e); }
  },
};
