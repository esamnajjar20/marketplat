import { z } from 'zod';
import { ReportStatus, ReportReason, ReportTargetType } from '@prisma/client';

// FEAT-REPORT-USER-STORE: kept as its own schema (not merged into the
// generic one below) because it's the original route shape
// (POST /reports/ads/:adId) — existing callers (ReportAdButton.tsx,
// the reports.test.ts suite) are untouched.
export const createReportSchema = z.object({
  params: z.object({ adId: z.string().min(1) }),
  body: z.object({
    reason: z.nativeEnum(ReportReason, {
      errorMap: () => ({ message: 'Invalid reason. Must be: SCAM, FAKE, OFFENSIVE, or SPAM' }),
    }),
    notes: z.string().max(500).optional(),
  }),
});

// FEAT-REPORT-USER-STORE: new generic endpoint for the two target types
// that never had a route at all (USER, STORE). The URL carries the
// target type as a path segment (mirrors createReportSchema's own
// :adId-in-path style, and stays lowercase like every other segment in
// this codebase — /slug/:slug, /seller/:sellerProfileId — even though
// the underlying Prisma enum value is uppercase) rather than putting
// targetType in the body, so the two invalid combinations (ads here, or
// an unknown segment) are rejected by routing/param validation before
// the handler ever runs. The transform maps the lowercase URL segment
// to the uppercase ReportTargetType the rest of the module works with.
export const createTargetReportSchema = z.object({
  params: z.object({
    targetType: z
      .enum(['users', 'stores'], {
        errorMap: () => ({ message: 'Invalid report target. Must be: users or stores' }),
      })
      .transform((v): 'USER' | 'STORE' => (v === 'users' ? 'USER' : 'STORE')),
    targetId: z.string().min(1),
  }),
  body: z.object({
    reason: z.nativeEnum(ReportReason, {
      errorMap: () => ({ message: 'Invalid reason. Must be: SCAM, FAKE, OFFENSIVE, or SPAM' }),
    }),
    notes: z.string().max(500).optional(),
  }),
});

export const updateReportStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.nativeEnum(ReportStatus, { errorMap: () => ({ message: 'Invalid report status' }) }),
  }),
});

export const getReportsSchema = z.object({
  query: z.object({
    // FIX BUG-FAV-01 (same bug, same fix, as favorites.validation.ts):
    // .optional() must come after .pipe(), not on the inner string
    // schema — otherwise an absent page/limit transforms `undefined`
    // into NaN via Number(undefined), which then fails the piped
    // z.number() check instead of being treated as "not provided".
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(1000))
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    status: z.nativeEnum(ReportStatus).optional(),
    // FEAT-REPORT-USER-STORE: lets the admin queue filter by target kind
    targetType: z.nativeEnum(ReportTargetType).optional(),
  }),
});

export const reportIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// FEAT-REPORT-USER-STORE: "بلاغاتي" — a reporter checking the status of
// reports they personally filed. Same page/limit shape as getReportsSchema
// but with no status/targetType filter (a user's own list is short enough
// not to need one, and admin-only filtering stays admin-only).
export const getMyReportsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(1000))
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
  }),
});

export type CreateReportInput = z.infer<typeof createReportSchema>['body'];
export type CreateTargetReportParams = z.infer<typeof createTargetReportSchema>['params'];
export type CreateTargetReportInput = z.infer<typeof createTargetReportSchema>['body'];
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>['body'];
export type GetReportsQuery = z.infer<typeof getReportsSchema>['query'];
export type GetMyReportsQuery = z.infer<typeof getMyReportsSchema>['query'];
