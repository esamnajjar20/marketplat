import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { Report, ReportStatus, ReportReason, Prisma } from '@prisma/client';
import { GetReportsQuery } from './reports.validation';

export type ReportWithDetails = Prisma.ReportGetPayload<{
  include: {
    ad: { select: { id: true; title: true; userId: true } };
    user: { select: { id: true; name: true; email: true } };
  };
}>;

const reportWithDetails = {
  ad: { select: { id: true, title: true, userId: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

export const reportsRepository = {
  // D-06: reason is typed as ReportReason (Prisma enum) — no more 'as any' cast
  create: async (
    userId: string,
    adId: string,
    reason: ReportReason,
    notes?: string
  ): Promise<Report> => prisma.report.create({ data: { userId, adId, reason, notes } }),

  findByUserAndAd: async (userId: string, adId: string): Promise<Report | null> =>
    prisma.report.findUnique({ where: { adId_userId: { adId, userId } } }),

  // D-05: read-only batch → Promise.all instead of $transaction
  findMany: async (
    query: GetReportsQuery
  ): Promise<{ reports: ReportWithDetails[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit); // A-06
    const where: Prisma.ReportWhereInput = { ...(status && { status }) };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: reportWithDetails,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.report.count({ where }),
    ]);

    return { reports, total };
  },

  findById: async (id: string): Promise<ReportWithDetails | null> =>
    prisma.report.findUnique({ where: { id }, include: reportWithDetails }),

  updateStatus: async (id: string, status: ReportStatus): Promise<ReportWithDetails> =>
    prisma.report.update({ where: { id }, data: { status }, include: reportWithDetails }),
};
