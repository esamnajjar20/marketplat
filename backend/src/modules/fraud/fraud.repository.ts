import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { GetFlaggedAdsQuery, GetFraudSignalsQuery } from './fraud.validation';

export type FraudSignalWithSubjects = Prisma.FraudSignalGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
    ad: { select: { id: true; title: true; status: true } };
  };
}>;

const fraudSignalWithSubjects = {
  user: { select: { id: true, name: true, email: true } },
  ad: { select: { id: true, title: true, status: true } },
} as const;

export type FlaggedAdRow = Prisma.AdGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true; createdAt: true } };
  };
}>;

const flaggedAdWithUser = {
  user: { select: { id: true, name: true, email: true, createdAt: true } },
} as const;

export const fraudRepository = {
  /**
   * Count of Ad rows created by this user within the last
   * `windowSeconds` — the raw input the RAPID_POSTING signal is
   * derived from. A plain COUNT, no caching: this only ever runs
   * synchronously inside createAd (low volume relative to e.g. GET
   * /ads), and correctness here (not missing a real burst) matters
   * more than shaving a query.
   */
  countRecentAdsByUser: async (userId: string, windowSeconds: number): Promise<number> => {
    const since = new Date(Date.now() - windowSeconds * 1000);
    return prisma.ad.count({
      where: { userId, createdAt: { gte: since } },
    });
  },

  /**
   * Median price for ACTIVE ads in the same category (excluding the
   * ad being scored, when it already has an id, so an edit doesn't
   * skew its own baseline) — the reference point SUSPICIOUS_PRICE
   * compares against. Postgres has no built-in MEDIAN aggregate, so
   * this uses percentile_cont(0.5), the standard SQL equivalent.
   * Returns null when there isn't enough category history yet (fewer
   * than 5 comparable ads) — scoreAd treats null as "skip this
   * signal", since a median of 1-2 data points isn't a meaningful
   * baseline and would produce false positives on a new/thin category.
   */
  getCategoryMedianPrice: async (
    categoryId: string,
    excludeAdId?: string
  ): Promise<number | null> => {
    const rows = await prisma.$queryRaw<{ median: number | null; sample_size: bigint }[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median,
        COUNT(*) AS sample_size
      FROM "ads"
      WHERE "categoryId" = ${categoryId}
        AND "status" = 'ACTIVE'
        AND "price" IS NOT NULL
        ${excludeAdId ? Prisma.sql`AND "id" != ${excludeAdId}` : Prisma.empty}
    `;
    const row = rows[0];
    if (!row || row.median === null || Number(row.sample_size) < 5) return null;
    return Number(row.median);
  },

  /** Active ads from the same user with a near-identical title+city+price — the DUPLICATE_LISTING check. */
  findPotentialDuplicates: async (
    userId: string,
    title: string,
    city: string,
    excludeAdId?: string
  ): Promise<{ id: string }[]> => {
    return prisma.ad.findMany({
      where: {
        userId,
        city,
        title: { equals: title, mode: 'insensitive' },
        status: 'ACTIVE',
        ...(excludeAdId && { id: { not: excludeAdId } }),
      },
      select: { id: true },
      take: 1,
    });
  },

  setAdRiskScore: async (
    tx: Prisma.TransactionClient,
    adId: string,
    riskScore: number,
    flaggedForReview: boolean
  ): Promise<void> => {
    await tx.ad.update({
      where: { id: adId },
      data: { riskScore, flaggedForReview },
    });
  },

  findFlaggedAds: async (
    query: GetFlaggedAdsQuery
  ): Promise<{ ads: FlaggedAdRow[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.AdWhereInput = { flaggedForReview: true };

    const [ads, total] = await Promise.all([
      prisma.ad.findMany({
        where,
        include: flaggedAdWithUser,
        orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      prisma.ad.count({ where }),
    ]);

    return { ads, total };
  },

  findSignals: async (
    query: GetFraudSignalsQuery
  ): Promise<{ signals: FraudSignalWithSubjects[]; total: number }> => {
    const { page = 1, limit = 20, type, userId, adId, reviewed } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.FraudSignalWhereInput = {
      ...(type && { type }),
      ...(userId && { userId }),
      ...(adId && { adId }),
      ...(reviewed !== undefined && { reviewed }),
    };

    const [signals, total] = await Promise.all([
      prisma.fraudSignal.findMany({
        where,
        include: fraudSignalWithSubjects,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.fraudSignal.count({ where }),
    ]);

    return { signals, total };
  },

  findSignalById: async (id: string): Promise<FraudSignalWithSubjects | null> => {
    return prisma.fraudSignal.findUnique({
      where: { id },
      include: fraudSignalWithSubjects,
    });
  },

  markSignalReviewed: async (id: string, adminUserId: string): Promise<FraudSignalWithSubjects> => {
    return prisma.fraudSignal.update({
      where: { id },
      data: { reviewed: true, reviewedAt: new Date(), reviewedBy: adminUserId },
      include: fraudSignalWithSubjects,
    });
  },

  /** Un-flags an ad after an admin has cleared its signals as false positives. */
  clearAdFlag: async (adId: string): Promise<void> => {
    await prisma.ad.update({
      where: { id: adId },
      data: { flaggedForReview: false },
    });
  },

  findUserCreatedAt: async (userId: string): Promise<Date | null> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    return user?.createdAt ?? null;
  },
};
