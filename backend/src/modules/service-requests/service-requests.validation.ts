import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

export const createServiceRequestSchema = z.object({
  body: z.object({
    listingId: z.string().min(1, 'listingId is required'),
    details: z.string().min(10, 'Details must be at least 10 characters').max(1000),
    attachedImages: z.array(z.string().url()).max(5, 'At most 5 attached images').optional(),
  }),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>['body'];

// services-design.md §7: only ACCEPTED/REJECTED (provider) or CANCELLED
// (either party, from ACCEPTED/IN_PROGRESS) or COMPLETED (provider, from
// IN_PROGRESS) are ever posted through this endpoint — PENDING is only
// ever the creation default, never a target of a transition request.
export const respondToServiceRequestSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    action: z.enum(['ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    quotedPrice: z.coerce.number().positive().multipleOf(0.01).optional(),
    agreedPrice: z.coerce.number().positive().multipleOf(0.01).optional(),
  }),
});

export type RespondToServiceRequestInput = z.infer<typeof respondToServiceRequestSchema>['body'];

export const serviceRequestIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Service request ID is required') }),
});

export const getServiceRequestsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z
      .enum(['PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
      .optional(),
  }),
});

export type GetServiceRequestsQuery = z.infer<typeof getServiceRequestsSchema>['query'];
