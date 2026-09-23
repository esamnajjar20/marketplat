import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    nameAr: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
    parentId: z.string().optional(),
  }),
});

export const updateCategorySchema = z.object({
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
    parentId: z.string().nullable().optional(),
  }),
});

export const categoryIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// T422 — same shape as the slug field on createCategorySchema, so a
// malformed slug (uppercase, spaces, symbols) is rejected at the edge
// rather than hitting the DB query as-is.
export const categorySlugParamSchema = z.object({
  params: z.object({
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];
