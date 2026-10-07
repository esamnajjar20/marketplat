import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const listCustomersSchema = z.object({
  query: paginationQuerySchema.extend({
    q: z.string().trim().max(100).optional(),
    dueOnly: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  }),
});

export const customerIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(40).optional().nullable(),
    email: z.string().email().max(320).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    isVip: z.boolean().optional(),
    isBlacklisted: z.boolean().optional(),
  }),
});

export const updateCustomerSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: createCustomerSchema.shape.body.partial().strict(),
});

export const customerSearchSchema = z.object({
  query: z.object({ q: z.string().trim().min(1).max(100) }),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>['body'];
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>['body'];
