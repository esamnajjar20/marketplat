import { z } from 'zod';

export const storeTypeLabelsSchema = z.object({
  products: z.string().min(1).max(100),
  product: z.string().min(1).max(100),
  addProduct: z.string().min(1).max(100),
  categories: z.string().min(1).max(100),
}).strict();

export const createStoreTypeSchema = z.object({
  body: z.object({
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
    nameAr: z.string().min(1).max(100),
    icon: z.string().min(1).max(100),
    labels: storeTypeLabelsSchema,
    freeProductLimit: z.number().int().min(0).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  }).strict(),
});

export const updateStoreTypeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    nameAr: z.string().min(1).max(100).optional(),
    icon: z.string().min(1).max(100).optional(),
    labels: storeTypeLabelsSchema.optional(),
    freeProductLimit: z.number().int().min(0).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  }).strict(),
});

export const storeTypeIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const updateStoreTypeStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ isActive: z.boolean() }).strict(),
});

export type StoreTypeLabels = z.infer<typeof storeTypeLabelsSchema>;
export type CreateStoreTypeInput = z.infer<typeof createStoreTypeSchema>['body'];
export type UpdateStoreTypeInput = z.infer<typeof updateStoreTypeSchema>['body'];
export type UpdateStoreTypeStatusInput = z.infer<typeof updateStoreTypeStatusSchema>['body'];
