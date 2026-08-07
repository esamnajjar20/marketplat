import { z } from 'zod';
import { FraudSignalType } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(schema)
    .optional();

const optionalQueryBoolean = () =>
  z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .optional();

export const getFlaggedAdsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export const getFraudSignalsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    type: z.nativeEnum(FraudSignalType).optional(),
    userId: z.string().trim().min(1).optional(),
    adId: z.string().trim().min(1).optional(),
    reviewed: optionalQueryBoolean(),
  }),
});

export const signalIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const adIdSchema = z.object({
  params: z.object({ adId: z.string().min(1) }),
});

// MANUAL_ADMIN_FLAG: lets an admin raise a signal by hand (e.g. from a
// pattern spotted while reviewing Reports) — see FraudSignalType's own
// doc comment in schema.prisma. userId is optional (a flag can target
// just the ad, just the account, or both — same "exactly one of
// userId/adId is primary depending on context" convention the model
// itself documents).
export const manualFlagSchema = z.object({
  params: z.object({ adId: z.string().min(1) }),
  body: z.object({
    reason: z.string().trim().min(1).max(500),
    userId: z.string().trim().min(1).optional(),
    weight: z.number().int().min(1).max(100).optional().default(50),
  }),
});

export type GetFlaggedAdsQuery = z.infer<typeof getFlaggedAdsSchema>['query'];
export type GetFraudSignalsQuery = z.infer<typeof getFraudSignalsSchema>['query'];
export type ManualFlagInput = z.infer<typeof manualFlagSchema>['body'];
