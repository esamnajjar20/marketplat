import { reportsRepository, ReportWithDetails } from './reports.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { usersService } from '../users'; // FEAT-REPORT-USER-STORE: target-exists check for USER reports
import { storesService } from '../stores'; // FEAT-REPORT-USER-STORE: target-exists check for STORE reports
import {
  CreateReportInput,
  CreateTargetReportInput,
  UpdateReportStatusInput,
  GetReportsQuery,
  GetMyReportsQuery,
} from './reports.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { Report, ReportTargetType, Prisma } from '@prisma/client';

// FIX D-08: same pattern already used in favoritesService — distinguishes
// a genuine duplicate-report race from any other unexpected DB error.
const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const TARGET_LABEL: Record<ReportTargetType, string> = {
  AD: 'ad',
  USER: 'user',
  STORE: 'store',
};

// FEAT-REPORT-USER-STORE: shared by both createReport (AD, existing
// route) and createTargetReport (USER/STORE, new route) — one place
// that (a) confirms the target actually exists, (b) blocks self-reports,
// (c) checks the existing-report guard, and (d) races the same P2002
// fallback D-08 already established for the AD-only path. Keeping this
// as the single write path means the AD case doesn't quietly drift from
// the USER/STORE cases as either evolves later.
const submitReport = async (
  userId: string,
  targetType: ReportTargetType,
  targetId: string,
  ownerId: string,
  input: CreateReportInput | CreateTargetReportInput
): Promise<Report> => {
  if (ownerId === userId) {
    throw new BadRequestError(`You cannot report your own ${TARGET_LABEL[targetType]}`);
  }

  const existing = await reportsRepository.findByUserAndTarget(userId, targetType, targetId);
  if (existing) {
    throw new BadRequestError(`You have already reported this ${TARGET_LABEL[targetType]}`);
  }

  // FIX D-08: the findByUserAndTarget check above has a TOCTOU race
  // window — two concurrent report submissions (double-click, or a
  // client retry after a flaky network) can both pass the check before
  // either insert commits. The @@unique([targetType, targetId, userId])
  // constraint then rejects the second insert with P2002, which
  // previously bubbled up unhandled to a generic 500 instead of the
  // same friendly "already reported" error.
  try {
    return await reportsRepository.create(userId, targetType, targetId, input.reason, input.notes);
  } catch (err) {
    if (isPrismaError(err, 'P2002')) {
      throw new BadRequestError(`You have already reported this ${TARGET_LABEL[targetType]}`);
    }
    throw err;
  }
};

export const reportsService = {
  createReport: async (userId: string, adId: string, input: CreateReportInput): Promise<Report> => {
    const ad = await adsService.findAdForReference(adId);
    if (!ad) throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    return submitReport(userId, 'AD', adId, ad.userId, input);
  },

  // FEAT-REPORT-USER-STORE: the two target kinds that never had a route
  // before. Each branch resolves the target's owning user first — for
  // STORE that's the seller behind it, not the store row itself, since
  // "you cannot report your own store" has to mean the seller who owns
  // it, mirroring how createReport already treats ad.userId as the ad's
  // owner for the same self-report check.
  createTargetReport: async (
    userId: string,
    targetType: 'USER' | 'STORE',
    targetId: string,
    input: CreateTargetReportInput
  ): Promise<Report> => {
    if (targetType === 'USER') {
      // usersService.getUserById already throws NotFoundError itself for
      // a missing/inactive user — let it propagate as-is rather than
      // swallowing every error into a generic "not found" (a transient
      // DB error underneath should surface as a 500, not a false 404).
      await usersService.getUserById(targetId);
      return submitReport(userId, 'USER', targetId, targetId, input);
    }

    const store = await storesService.findStoreForReference(targetId);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    return submitReport(userId, 'STORE', targetId, store.sellerProfile.userId, input);
  },

  getReports: async (query: GetReportsQuery): Promise<PaginatedResult<ReportWithDetails>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { reports, total } = await reportsRepository.findMany(query);
    return { items: reports, meta: buildPaginationMeta(total, page, limit) };
  },

  // FEAT-REPORT-USER-STORE: "بلاغاتي" — lets a reporter check the status
  // of reports they personally filed (any target type), without needing
  // admin access. Scoped to userId=reporter inside the repository query
  // itself, so this can never return a report someone else filed.
  getMyReports: async (
    userId: string,
    query: GetMyReportsQuery
  ): Promise<PaginatedResult<ReportWithDetails>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { reports, total } = await reportsRepository.findManyByReporter(userId, query);
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
