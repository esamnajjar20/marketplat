import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { Report, ReportStatus, ReportReason, ReportTargetType, Prisma } from '@prisma/client';
import { GetReportsQuery, GetMyReportsQuery } from './reports.validation';

// FEAT-REPORT-USER-STORE: ad is now optional (only populated for
// targetType=AD reports) — `ad: true` on a USER/STORE report just
// resolves to null, which ReportWithDetails' `| null` on the ad field
// already models correctly via Prisma's own optional-relation typing.
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
  // FEAT-REPORT-USER-STORE: adId is now set only when targetType is AD
  // (kept for the legacy `ad: { select: ... }` include to keep resolving
  // ad title/owner without a query-time branch elsewhere).
  create: async (
    userId: string,
    targetType: ReportTargetType,
    targetId: string,
    reason: ReportReason,
    notes?: string
  ): Promise<Report> =>
    prisma.report.create({
      data: {
        userId,
        targetType,
        targetId,
        adId: targetType === 'AD' ? targetId : undefined,
        reason,
        notes,
      },
    }),

  findByUserAndTarget: async (
    userId: string,
    targetType: ReportTargetType,
    targetId: string
  ): Promise<Report | null> =>
    prisma.report.findUnique({
      where: { targetType_targetId_userId: { targetType, targetId, userId } },
    }),

  // D-05: read-only batch → Promise.all instead of $transaction
  findMany: async (
    query: GetReportsQuery
  ): Promise<{ reports: ReportWithDetails[]; total: number }> => {
    const { page = 1, limit = 20, status, targetType } = query;
    const { skip, take } = getPaginationParams(page, limit); // A-06
    const where: Prisma.ReportWhereInput = {
      ...(status && { status }),
      ...(targetType && { targetType }),
    };

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

  // FEAT-REPORT-USER-STORE: "بلاغاتي" — a reporter's own submitted
  // reports, any target type, own rows only (userId is the filing
  // reporter, never the target — so this can never leak a report
  // someone else filed against this same user).
  findManyByReporter: async (
    userId: string,
    query: GetMyReportsQuery
  ): Promise<{ reports: ReportWithDetails[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ReportWhereInput = { userId };

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
