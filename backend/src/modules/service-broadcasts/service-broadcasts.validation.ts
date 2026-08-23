import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

export const createBroadcastSchema = z.object({
  body: z.object({
    categoryId: z.string().min(1, 'categoryId is required'),
    title: z.string().min(5, 'Title must be at least 5 characters').max(150),
    description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
    city: z.string().min(1).max(100).optional(),
    attachedImages: z.array(z.string().url()).max(5, 'At most 5 attached images').optional(),
  }),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>['body'];

export const broadcastIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Broadcast ID is required') }),
});

// GET /service-broadcasts — the open feed providers browse. categoryId
// and city are filters; status is deliberately NOT a query param here
// (always OPEN — see service-broadcasts.service.ts's getOpenFeed) since
// a closed/cancelled broadcast has nothing left for a browsing provider
// to act on.
export const getOpenBroadcastsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    categoryId: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
  }),
});

export type GetOpenBroadcastsQuery = z.infer<typeof getOpenBroadcastsSchema>['query'];

export const getMyBroadcastsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetMyBroadcastsQuery = z.infer<typeof getMyBroadcastsSchema>['query'];

export const submitQuoteSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Broadcast ID is required') }),
  body: z.object({
    price: z.coerce.number().positive().multipleOf(0.01),
    message: z.string().max(1000).optional(),
    durationEstimate: z.string().max(100).optional(),
  }),
});

export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>['body'];

export const quoteParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Broadcast ID is required'),
    quoteId: z.string().min(1, 'Quote ID is required'),
  }),
});
