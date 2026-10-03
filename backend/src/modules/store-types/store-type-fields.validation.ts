import { z } from 'zod';

export const storeFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT']);

const optionsSchema = z.array(z.object({
  value: z.string().min(1).max(80),
  labelAr: z.string().min(1).max(100),
}).strict()).min(1).max(30);

export const createStoreTypeFieldSchema = z.object({
  params: z.object({ storeTypeId: z.string().min(1) }),
  body: z.object({
    key: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/),
    labelAr: z.string().min(1).max(100),
    cardLabelAr: z.string().max(100).nullable().optional(),
    pageLabelAr: z.string().max(100).nullable().optional(),
    showOnCard: z.boolean().optional().default(false),
    showOnPage: z.boolean().optional().default(true),
    type: storeFieldTypeSchema,
    required: z.boolean().optional().default(false),
    options: optionsSchema.optional(),
    sortOrder: z.number().int().min(0).max(10000).optional().default(0),
  }).strict().superRefine((body, ctx) => {
    if (body.type === 'SELECT' && !body.options?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Select fields require options' });
    }
    if (body.type !== 'SELECT' && body.options) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Only select fields may define options' });
    }
  }),
});

export const updateStoreTypeFieldSchema = z.object({
  params: z.object({ storeTypeId: z.string().min(1), fieldId: z.string().min(1) }),
  body: z.object({
    labelAr: z.string().min(1).max(100).optional(),
    cardLabelAr: z.string().max(100).nullable().optional(),
    pageLabelAr: z.string().max(100).nullable().optional(),
    showOnCard: z.boolean().optional(),
    showOnPage: z.boolean().optional(),
    type: storeFieldTypeSchema.optional(),
    required: z.boolean().optional(),
    options: optionsSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const storeTypeFieldListSchema = z.object({
  params: z.object({ storeTypeId: z.string().min(1) }),
});

export type CreateStoreTypeFieldInput = z.infer<typeof createStoreTypeFieldSchema>['body'];
export type UpdateStoreTypeFieldInput = z.infer<typeof updateStoreTypeFieldSchema>['body'];
