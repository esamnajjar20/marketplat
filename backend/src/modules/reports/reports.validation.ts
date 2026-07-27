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
    page: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform(Number)
      .pipe(z.number().min(1).max(1000).optional()),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform(Number)
      .pipe(z.number().min(1).max(100).optional()),
    status: z.nativeEnum(ReportStatus).optional(),
  }),
});

export const reportIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type CreateReportInput = z.infer<typeof createReportSchema>['body'];
export type UpdateReportStatusInput = z.infer<typeof updateReportStatusSchema>['body'];
export type GetReportsQuery = z.infer<typeof getReportsSchema>['query'];
