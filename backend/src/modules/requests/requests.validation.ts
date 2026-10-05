import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

const requestTypeEnum = z.enum(['SERVICE', 'PRODUCT', 'RENTAL']);

export const createRequestSchema = z.object({
  body: z
    .object({
      type: requestTypeEnum,
      categoryId: z.string().min(1, 'categoryId is required'),
      title: z.string().min(5, 'Title must be at least 5 characters').max(150),
      description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
      city: z.string().min(1).max(100).optional(),
      attachedImages: z.array(z.string().url()).max(5, 'At most 5 attached images').optional(),
      // Optional budgets — product decision: not required for every type.
      budgetMin: z.coerce.number().nonnegative().multipleOf(0.01).optional(),
      budgetMax: z.coerce.number().positive().multipleOf(0.01).optional(),
      attributes: z.record(z.unknown()).optional(),
      /** Days until expiry; default applied in service if omitted (14). */
      expiresInDays: z.coerce.number().int().min(1).max(60).optional(),
      serviceTypeId: z.string().min(1).optional(),
    })
    .refine(
      (b) =>
        b.budgetMin === undefined ||
        b.budgetMax === undefined ||
        b.budgetMin <= b.budgetMax,
      { message: 'budgetMin must be <= budgetMax', path: ['budgetMin'] },
    )
    .refine(
      (b) => b.serviceTypeId === undefined || b.type === 'SERVICE',
      { message: 'serviceTypeId requires type=SERVICE', path: ['serviceTypeId'] },
    ),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>['body'];

export const requestIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Request ID is required') }),
});

/** Open-feed sort — must match frontend RequestSort / API query `sort`. */
export const openRequestSortEnum = z.enum([
  'newest',
  'expiring',
  'budget_high',
  'fewest_offers',
]);

export const getOpenRequestsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    type: requestTypeEnum.optional(),
    categoryId: z.string().min(1).optional(),
    serviceTypeId: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    q: z.string().min(1).max(100).optional(),
    sort: openRequestSortEnum.optional(),
  }).refine(
    (q) => q.serviceTypeId === undefined || q.type === 'SERVICE',
    { message: 'serviceTypeId requires type=SERVICE', path: ['serviceTypeId'] },
  ),
});

export type GetOpenRequestsQuery = z.infer<typeof getOpenRequestsSchema>['query'];

export const getMyRequestsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z.enum(['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED']).optional(),
  }),
});

export type GetMyRequestsQuery = z.infer<typeof getMyRequestsSchema>['query'];

// T352 — offers have a distinct lifecycle (PENDING/ACCEPTED/DECLINED/WITHDRAWN),
// NOT the request lifecycle. Reusing getMyRequestsSchema silently dropped the
// filter because the enums don't overlap.
export const getMyOffersSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']).optional(),
  }),
});

export type GetMyOffersQuery = z.infer<typeof getMyOffersSchema>['query'];

export const submitOfferSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Request ID is required') }),
  body: z.object({
    price: z.coerce.number().positive().multipleOf(0.01),
    message: z.string().max(1000).optional(),
    meta: z.record(z.unknown()).optional(),
  }),
});

export type SubmitOfferInput = z.infer<typeof submitOfferSchema>['body'];

export const offerParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Request ID is required'),
    offerId: z.string().min(1, 'Offer ID is required'),
  }),
});
