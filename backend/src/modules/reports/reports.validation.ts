import { z } from 'zod';
import { ReportStatus, ReportReason } from '@prisma/client';

export const createReportSchema = z.object({
  params: z.object({ adId: z.string().min(1) }),
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
  }),
});

export const reportIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type CreateReportInput = z.infer<typeof createReportSchema>['body'];
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>['body'];
export type GetReportsQuery = z.infer<typeof getReportsSchema>['query'];
