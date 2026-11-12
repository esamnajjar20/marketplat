import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/prisma';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { successResponse } from '../../../shared/types/api-response.types';

export const publicSalesStatsController = {
  getStoreStats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.slug ?? '').trim();
      const store = await prisma.storeDetails.findUnique({
        where: { slug },
        include: {
          sellerProfile: {
            select: { verified: true, averageRating: true, totalRatings: true },
          },
        },
      });
      if (!store || store.status !== 'ACTIVE')
        throw new NotFoundError('Store not found.', 'STORE_NOT_FOUND');
      // A fully refunded sale is not counted as a completed public sale.
      // Partially refunded sales remain counted; zero-value sales remain valid.
      const [aggregate] = await prisma.$queryRaw<Array<{ totalSales: bigint; lastSaleAt: Date | null }>>`
        SELECT COUNT(*)::bigint AS "totalSales", MAX("soldAt") AS "lastSaleAt"
        FROM "sale_records"
        WHERE "storeId" = ${store.id}
          AND ("refundedAmount" < "totalPrice" OR ("totalPrice" = 0 AND "refundedAmount" = 0))
      `;
      res.json(
        successResponse('Public store sales stats fetched', {
          storeId: store.id,
          storeName: store.name,
          storeSlug: store.slug,
          totalSales: Number(aggregate?.totalSales ?? 0),
          averageRating: Number(store.sellerProfile.averageRating),
          reviewCount: store.sellerProfile.totalRatings,
          verifiedSeller: store.sellerProfile.verified,
          lastSaleAt: aggregate?.lastSaleAt ?? null,
        })
      );
    } catch (e) {
      next(e);
    }
  },
};
