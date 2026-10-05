import { z } from 'zod';
import { ServiceTypeFieldScope, ServiceTypeFieldType } from '@prisma/client';

const jsonValue = z.record(z.string(), z.unknown());

export const createServiceTypeSchema = z.object({
  body: z.object({
    slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2).max(100),
    nameAr: z.string().min(2).max(100),
    icon: z.string().max(100).nullable().optional(),
    labels: jsonValue.optional(),
    capabilities: jsonValue.optional(),
    presentation: jsonValue.optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateServiceTypeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: createServiceTypeSchema.shape.body.partial(),
});

export const createServiceTypeFieldSchema = z.object({
  body: z.object({
    serviceTypeId: z.string().min(1),
    key: z.string().min(2).max(100).regex(/^[a-z][a-z0-9_]*$/),
    scope: z.nativeEnum(ServiceTypeFieldScope).default('LISTING'),
    label: z.string().min(1).max(100),
    labelAr: z.string().min(1).max(100),
    cardLabelAr: z.string().max(100).nullable().optional(),
    pageLabelAr: z.string().max(100).nullable().optional(),
    type: z.nativeEnum(ServiceTypeFieldType),
    required: z.boolean().optional(),
    showOnCard: z.boolean().optional(),
    showOnPage: z.boolean().optional(),
    options: z.array(z.object({ value: z.string().min(1).max(100), labelAr: z.string().min(1).max(100) })).max(100).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateServiceTypeFieldSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: createServiceTypeFieldSchema.shape.body.omit({ serviceTypeId: true }).partial(),
});

export const serviceTypeIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>['body'];
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>['body'];
export type CreateServiceTypeFieldInput = z.infer<typeof createServiceTypeFieldSchema>['body'];
export type UpdateServiceTypeFieldInput = z.infer<typeof updateServiceTypeFieldSchema>['body'];
