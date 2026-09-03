import { z } from 'zod';
import { StoreStatus, StorePlan } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

// UNIFY-PAYMENTS-STORES: no local storePaymentMethodSchema here anymore
// — a store's payment methods are now just its parent seller's
// (sellers.validation.ts / shared/utils/paymentMethodSchema.ts owns the
// one copy of this schema, since sellers.service.ts is the only place
// paymentMethods is ever written from). See StoreDetails' schema.prisma
// comment for why.

// STORE-HOURS (Foundation v1): identical shape to
// service-providers.validation.ts's workingHoursSchema — same
// { sun: {open,close}|null, ... } convention deliberately reused so
// storesService.computeIsOpen and any future shared frontend component
// only need to handle one shape across both modules.
const dayScheduleSchema = z
  .object({
    open: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'open must be HH:mm'),
    close: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'close must be HH:mm'),
  })
  .nullable();

export const workingHoursSchema = z.object({
  sun: dayScheduleSchema,
  mon: dayScheduleSchema,
  tue: dayScheduleSchema,
  wed: dayScheduleSchema,
  thu: dayScheduleSchema,
  fri: dayScheduleSchema,
  sat: dayScheduleSchema,
});

export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;

export const createStoreSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Store name must be at least 2 characters').max(100),
    description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
    city: z.string().min(1, 'City is required').max(100),
    address: z.string().max(200).optional(),
    phone: z
      .string()
      .min(7, 'Phone number is too short')
      .max(20, 'Phone number is too long'),
    logoUrl: z.string().url('logoUrl must be a valid URL').optional(),
    coverImageUrl: z.string().url('coverImageUrl must be a valid URL').optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    workingHours: workingHoursSchema.optional(),
  }),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>['body'];

export const updateStoreSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().min(10).max(1000).optional(),
    city: z.string().min(1).max(100).optional(),
    address: z.string().max(200).nullable().optional(),
    phone: z.string().min(7).max(20).optional(),
    logoUrl: z.string().url().nullable().optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    workingHours: workingHoursSchema.optional(),
  }),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>['body'];

export const storeIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Store ID is required') }),
});

export const STORE_SORT_FIELDS = ['createdAt', 'name'] as const;
export type StoreSortField = (typeof STORE_SORT_FIELDS)[number];

export const getStoresSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    city: z.string().max(100).optional(),
    search: z.string().min(1).max(200).optional(),
    sortBy: z.enum(STORE_SORT_FIELDS).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    // Featured stores surface first when this isn't explicitly disabled
    // — see stores.repository.ts's findMany orderBy.
  }),
});

export type GetStoresQuery = z.infer<typeof getStoresSchema>['query'];

// Admin directory query — unlike getStoresSchema (public, always
// ACTIVE-only), admins need to filter by any status including PENDING
// (the ones needing approval) and BLOCKED. Mirrors sellers.validation.ts's
// adminGetSellersSchema shape (page/limit/q + status filter).
export const adminGetStoresSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z.nativeEnum(StoreStatus).optional(),
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export type AdminGetStoresQuery = z.infer<typeof adminGetStoresSchema>['query'];

// Admin-only status transition (PENDING → ACTIVE/BLOCKED), same shape
// as sellers.validation.ts's verifySellerSchema/suspendSellerSchema.
export const updateStoreStatusSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Store ID is required') }),
  body: z.object({
    status: z.nativeEnum(StoreStatus),
    reason: z.string().trim().min(3).max(500).optional(),
  }).superRefine((body, ctx) => {
    if (body.status === 'BLOCKED' && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason is required when blocking a store',
        path: ['reason'],
      });
    }
  }),
});

export type UpdateStoreStatusInput = z.infer<typeof updateStoreStatusSchema>['body'];

// FIX BUG-02: StorePlan.FEATURED existed in the schema and was rendered
// across StoreHeader/StoreCard/MyStoreCard/FeaturedStoresSection, but no
// code path anywhere ever set a store's plan to FEATURED — no admin
// endpoint, no billing. This closes that gap: same admin-transition
// shape as updateStoreStatusSchema above.
export const updateStorePlanSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Store ID is required') }),
  body: z.object({
    plan: z.nativeEnum(StorePlan),
  }),
});

export type UpdateStorePlanInput = z.infer<typeof updateStorePlanSchema>['body'];

// BULK-ADMIN (item 17): same 1-100 id-array cap as
// admin.validation.ts's bulkIdsSchema / sellers.validation.ts's
// bulkSellerIdsSchema — same reasoning as those, duplicated locally
// rather than shared across modules for one array shape.
const bulkStoreIdsSchema = z.array(z.string().min(1)).min(1, 'At least one id is required').max(100);

export const bulkUpdateStoreStatusSchema = z.object({
  body: z.object({
    storeIds: bulkStoreIdsSchema,
    status: z.nativeEnum(StoreStatus),
    reason: z.string().trim().min(3).max(500).optional(),
  }).superRefine((body, ctx) => {
    if (body.status === 'BLOCKED' && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason is required when blocking stores',
        path: ['reason'],
      });
    }
  }),
});

export type BulkUpdateStoreStatusInput = z.infer<typeof bulkUpdateStoreStatusSchema>['body'];

export const createStoreReviewSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Store ID is required') }),
  body: z.object({
    score: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(500, 'Comment must be at most 500 characters').optional(),
  }),
});

export type CreateStoreReviewInput = z.infer<typeof createStoreReviewSchema>['body'];

export const getStoreReviewsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetStoreReviewsQuery = z.infer<typeof getStoreReviewsSchema>['query'];
