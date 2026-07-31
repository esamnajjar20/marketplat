import { reportsRepository, ReportWithDetails } from './reports.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { CreateReportInput, UpdateReportStatusInput, GetReportsQuery } from './reports.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { Report, Prisma } from '@prisma/client';

// FIX D-08: same pattern already used in favoritesService — distinguishes
// a genuine duplicate-report race from any other unexpected DB error.
const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

export const reportsService = {
  createReport: async (userId: string, adId: string, input: CreateReportInput): Promise<Report> => {
    const ad = await adsService.findAdForReference(adId);
    if (!ad) throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId === userId) throw new BadRequestError('You cannot report your own ad');

    const existing = await reportsRepository.findByUserAndAd(userId, adId);
    if (existing) throw new BadRequestError('You have already reported this ad');

    // FIX D-08: the findByUserAndAd check above has a TOCTOU race window —
    // two concurrent report submissions (double-click, or a client retry
    // after a flaky network) can both pass the check before either insert
    // commits. The @@unique([adId, userId]) constraint then rejects the
    // second insert with P2002, which previously bubbled up unhandled to
    // a generic 500 instead of the same friendly "already reported" error.
    try {
      return await reportsRepository.create(userId, adId, input.reason, input.notes);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('You have already reported this ad');
      }
      throw err;
    }
  },

  getReports: async (query: GetReportsQuery): Promise<PaginatedResult<ReportWithDetails>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { reports, total } = await reportsRepository.findMany(query);
    return { items: reports, meta: buildPaginationMeta(total, page, limit) };
  },

  getReportById: async (id: string): Promise<ReportWithDetails> => {
    const report = await reportsRepository.findById(id);
    if (!report) throw new NotFoundError('Report not found');
    return report;
  },

  updateReportStatus: async (
    id: string,
    input: UpdateReportStatusInput
  ): Promise<ReportWithDetails> => {
    const report = await reportsRepository.findById(id);
    if (!report) throw new NotFoundError('Report not found');
    return reportsRepository.updateStatus(id, input.status);
  },
};
