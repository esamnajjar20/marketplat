import { z } from 'zod';

export const createServiceReviewSchema = z.object({
  body: z.object({
    requestId: z.string().min(1, 'requestId is required'),
    score: z.coerce.number().int().min(1, 'Score must be between 1 and 5').max(5),
    comment: z.string().max(500).optional(),
  }),
});

export type CreateServiceReviewInput = z.infer<typeof createServiceReviewSchema>['body'];

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

export const getServiceReviewsSchema = z.object({
  params: z.object({ sellerProfileId: z.string().min(1) }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetServiceReviewsQuery = z.infer<typeof getServiceReviewsSchema>['query'];
