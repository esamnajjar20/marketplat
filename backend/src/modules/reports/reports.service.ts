import { reportsRepository, ReportWithDetails } from './reports.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { usersService } from '../users'; // FEAT-REPORT-USER-STORE: target-exists check for USER reports
import { storesService } from '../stores'; // FEAT-REPORT-USER-STORE: target-exists check for STORE reports
import { productsService } from '../products';
import { serviceListingsService } from '../service-listings';
import {
  CreateReportInput,
  CreateTargetReportInput,
  UpdateReportStatusInput,
  BulkUpdateReportStatusInput,
  GetReportsQuery,
  GetMyReportsQuery,
} from './reports.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { Report, ReportTargetType } from '@prisma/client';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { env } from '../../config/env';
import { notificationEvents } from '../notifications/notifications.service';

const TARGET_LABEL: Record<ReportTargetType, string> = {
  AD: 'ad',
  USER: 'user',
  STORE: 'store',
  PRODUCT: 'product',
  SERVICE_LISTING: 'service listing',
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

  // the findByUserAndTarget check above has a TOCTOU race
  // window — two concurrent report submissions (double-click, or a
  // client retry after a flaky network) can both pass the check before
  // either insert commits. The @@unique([targetType, targetId, userId])
  // constraint then rejects the second insert with P2002, which
  // previously bubbled up unhandled to a generic 500 instead of the
  // same friendly "already reported" error.
  try {
    const report = await reportsRepository.create(userId, targetType, targetId, input.reason, input.notes);

    // Only ADs have an existing public visibility flag. Three distinct reporters
    // hide an active ad while leaving the report queue and audit trail
    // intact; moderators can clear the flag after review.
    let autoHidden = false;
    if (targetType === 'AD') {
      const reportCount = await reportsRepository.countDistinctPendingReporters(targetType, targetId);
      if (reportCount >= env.fraud.reportAutoHideThreshold) {
        autoHidden = await reportsRepository.autoHideAdIfStillActive(targetId);
      }
    }

    void notificationEvents.onModerationReportReceived({
      reportId: report.id,
      targetType,
      targetId,
      targetLabel: TARGET_LABEL[targetType],
      autoHidden,
    }).catch(() => {});

    return report;
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
    targetType: 'USER' | 'STORE' | 'PRODUCT' | 'SERVICE_LISTING',
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

    if (targetType === 'STORE') {
      const store = await storesService.findStoreForReference(targetId);
      if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
      return submitReport(userId, 'STORE', targetId, store.sellerProfile.userId, input);
    }

    if (targetType === 'PRODUCT') {
      const product = await productsService.findProductForReference(targetId);
      if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
      const store = await storesService.findStoreForReference(product.storeId);
      if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
      return submitReport(userId, 'PRODUCT', targetId, store.sellerProfile.userId, input);
    }

    // SERVICE_LISTING
    // previously tried to pluck `provider.userId`
    // off a return value that never carried a `provider` relation at all
    // (findServiceListingForReference returned the bare listing row), so
    // this branch always fell through to NotFoundError — the "report a
    // service" button never worked. findServiceListingForReference now
    // returns the full ServiceListingWithProvider (findPublicById's
    // include), which is exactly the shape reports.service needs:
    // provider.sellerProfile.userId is the listing owner's user id,
    // mirroring how ads' ad.userId and stores' sellerProfile.userId
    // resolve the same "who owns this thing" question in the sibling
    // branches above.
    const listing = await serviceListingsService.findServiceListingForReference(targetId);
    if (!listing) throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    const listingOwner = listing.provider.sellerProfile.userId;
    return submitReport(userId, 'SERVICE_LISTING', targetId, listingOwner, input);
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
    const updated = await reportsRepository.updateStatus(id, input.status);

    // The reporter always gets the outcome. For AD reports the owner also gets
    // a neutral review-result notice; no internal moderation notes are exposed.
    const recipients = new Set<string>([report.user.id]);
    if (report.targetType === 'AD' && report.ad?.userId) recipients.add(report.ad.userId);
    void notificationEvents.onModerationDecision({
      userIds: [...recipients],
      reportId: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      status: input.status,
      targetTitle: report.ad?.title ?? TARGET_LABEL[report.targetType],
    }).catch(() => {});

    // A resolved/dismissed AD is safe to surface again only when the moderator
    // explicitly clears the review flag; changing report status alone must not
    // accidentally publish content.
    return updated;
  },

  // BULK-ADMIN (item 17): best-effort batch, not all-or-nothing — an
  // admin clearing a 50-report queue must not have the whole batch
  // rejected because one report was already actioned by another admin
  // moderator in the meantime (a real race in a multi-admin queue, not
  // a hypothetical). Returns which ids actually updated and which
  // didn't (with why), so the caller can show a precise partial-success
  // result instead of a single opaque pass/fail.
  bulkUpdateReportStatus: async (
    input: BulkUpdateReportStatusInput
  ): Promise<{ updated: ReportWithDetails[]; failed: { id: string; reason: string }[] }> =>
    reportsRepository.updateManyStatus(input.reportIds, input.status),
};
