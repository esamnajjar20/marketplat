import { z } from 'zod';

export const createProductCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    nameAr: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
    icon: z.string().max(100).optional(),
    parentId: z.string().optional(),
    storeTypeId: z.string().min(1).nullable().optional(),
  }),
});

export const updateProductCategorySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    nameAr: z.string().min(2).max(100).optional(),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    icon: z.string().max(100).nullable().optional(),
    parentId: z.string().nullable().optional(),
    storeTypeId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const productCategoryIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// T433 — same slug rules as createProductCategorySchema.slug applied
// to the read path so a malformed value is rejected at the edge.
export const productCategorySlugParamSchema = z.object({
  params: z.object({
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
  }),
});

export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>['body'];
export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>['body'];
