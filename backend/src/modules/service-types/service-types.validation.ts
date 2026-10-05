import { z } from 'zod';
import { ServiceTypeFieldScope, ServiceTypeFieldType } from '@prisma/client';

const jsonValue = z.record(z.string(), z.unknown());
const capabilitiesSchema = z.object({
  appointments: z.boolean().optional(), requestQuote: z.boolean().optional(), remote: z.boolean().optional(),
  atCustomer: z.boolean().optional(), atProvider: z.boolean().optional(),
  allowedPricingTypes: z.array(z.enum(['FIXED','STARTING_FROM','NEGOTIABLE'])).min(1).max(3).superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'allowedPricingTypes must not contain duplicates' });
    }
  }).optional(),
  allowedLocations: z.array(z.enum(['AT_CUSTOMER','AT_PROVIDER','REMOTE'])).min(1).max(3).superRefine((values, ctx) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'allowedLocations must not contain duplicates' });
    }
  }).optional(),
}).strict().superRefine((value, ctx) => {
  const allowed = value.allowedLocations;
  if (value.remote === false && allowed?.includes('REMOTE')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedLocations'], message: 'REMOTE cannot be allowed when remote is false' });
  }
  if (value.atCustomer === false && allowed?.includes('AT_CUSTOMER')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedLocations'], message: 'AT_CUSTOMER cannot be allowed when atCustomer is false' });
  }
  if (value.atProvider === false && allowed?.includes('AT_PROVIDER')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedLocations'], message: 'AT_PROVIDER cannot be allowed when atProvider is false' });
  }
});

export function validateServiceTypeCapabilitiesDefinition(capabilities: unknown): void {
  const result = capabilitiesSchema.safeParse(capabilities);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid service type capabilities');
  }
}

const serviceTypeFieldOptionsSchema = z.array(
  z.object({
    value: z.string().min(1).max(100),
    labelAr: z.string().min(1).max(100),
  }).strict()
).max(100).superRefine((options, ctx) => {
  const values = options.map((option) => option.value);
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Field option values must be unique' });
  }
});

const serviceTypeFieldBaseSchema = z.object({
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
  options: serviceTypeFieldOptionsSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}).strict();

export function validateServiceTypeFieldDefinition(input: { type: ServiceTypeFieldType; options?: Array<{ value: string; labelAr: string }> | null }): void {
  const needsOptions = input.type === 'SELECT' || input.type === 'MULTI_SELECT';
  if (needsOptions && (!input.options || input.options.length === 0)) {
    throw new Error('SELECT and MULTI_SELECT fields require at least one option');
  }
  if (!needsOptions && input.options && input.options.length > 0) {
    throw new Error('Options are only valid for SELECT and MULTI_SELECT fields');
  }
  if (input.options) {
    const result = serviceTypeFieldOptionsSchema.safeParse(input.options);
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'Invalid field options');
  }
}

export const createServiceTypeSchema = z.object({
  body: z.object({
    slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2).max(100),
    nameAr: z.string().min(2).max(100),
    icon: z.string().max(100).nullable().optional(),
    labels: jsonValue.optional(),
    capabilities: capabilitiesSchema.optional(),
    presentation: jsonValue.optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const updateServiceTypeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: createServiceTypeSchema.shape.body.partial(),
});

export const createServiceTypeFieldSchema = z.object({
  body: serviceTypeFieldBaseSchema.extend({
    serviceTypeId: z.string().min(1),
  }),
});

export const updateServiceTypeFieldSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  // key and serviceTypeId are immutable: changing either would invalidate
  // existing attributes stored on service listings.
  body: serviceTypeFieldBaseSchema.omit({ key: true, scope: true, type: true }).partial(),
});

export const serviceTypeIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>['body'];
export type UpdateServiceTypeInput = z.infer<typeof updateServiceTypeSchema>['body'];
export type CreateServiceTypeFieldInput = z.infer<typeof createServiceTypeFieldSchema>['body'];
export type UpdateServiceTypeFieldInput = z.infer<typeof updateServiceTypeFieldSchema>['body'];
