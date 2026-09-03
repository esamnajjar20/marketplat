import { z } from 'zod';

// FIX BUG-07: was a local mirror of admin.validation.ts's copy (EPIC
// 1.1's comment said as much); now both import the same helper instead
// of keeping two hand-synced copies.
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';
// FIX: was a local copy identical to stores.validation.ts's — see
// paymentMethodSchema.ts's comment for the dedup rationale.
import { storePaymentMethodSchema } from '../../shared/utils/paymentMethodSchema';

export const adminGetSellersSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    verified: z
      .enum(['true', 'false'])
      .optional()
      .transform(v => (v === undefined ? undefined : v === 'true')),
    verificationStatus: z
      .enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'])
      .optional(),
    suspended: z
      .enum(['true', 'false'])
      .optional()
      .transform(v => (v === undefined ? undefined : v === 'true')),
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export type AdminGetSellersQuery = z.infer<typeof adminGetSellersSchema>['query'];

export const createSellerProfileSchema = z.object({
  body: z.object({
    displayName: z.string().min(2, 'Display name must be at least 2 characters').max(50).optional(),
    bio: z.string().max(300, 'Bio must be at most 300 characters').optional(),
    avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
    agreedToSellerTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must agree to the seller terms.' }),
    }),
  }),
});

export type CreateSellerProfileInput = z.infer<typeof createSellerProfileSchema>['body'];

/** PATCH /sellers/me/profile — owner may update display fields only. */
export const updateSellerProfileSchema = z.object({
  body: z
    .object({
      displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50).optional(),
      bio: z
        .union([z.string().trim().max(300, 'Bio must be at most 300 characters'), z.null()])
        .optional(),
      avatarUrl: z
        .union([z.string().url('avatarUrl must be a valid URL'), z.null()])
        .optional(),
      paymentMethods: z.array(storePaymentMethodSchema).max(20).nullable().optional(),
    })
    .refine(
      (body) =>
        body.displayName !== undefined || body.bio !== undefined || body.avatarUrl !== undefined || body.paymentMethods !== undefined,
      { message: 'At least one field is required' }
    ),
});

export type UpdateSellerProfileInput = z.infer<typeof updateSellerProfileSchema>['body'];


export const sellerIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Seller profile ID is required') }),
});

export const createRatingSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Seller profile ID is required') }),
  body: z.object({
    adId: z.string().min(1).optional(),
    score: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(500, 'Comment must be at most 500 characters').optional(),
  }),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>['body'];

// TRACK-AD-RATINGS-LIST: mirrors stores.validation.ts's
// getStoreReviewsSchema exactly (same page/limit bounds) — no other
// filters, same as that one.
export const getSellerRatingsSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Seller profile ID is required') }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetSellerRatingsQuery = z.infer<typeof getSellerRatingsSchema>['query'];

export const verifySellerSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Seller profile ID is required') }),
  body: z.object({
    verified: z.boolean(),
  }),
});

export type VerifySellerInput = z.infer<typeof verifySellerSchema>['body'];

// AUDIT-FIX: mirrors verifySellerSchema exactly — admin-only suspend/
// unsuspend toggle.
export const suspendSellerSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Seller profile ID is required') }),
  body: z.object({
    suspended: z.boolean(),
    reason: z.string().trim().min(3).max(500).optional(),
  }).superRefine((body, ctx) => {
    if (body.suspended && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason is required when suspending a seller',
        path: ['reason'],
      });
    }
  }),
});

export type SuspendSellerInput = z.infer<typeof suspendSellerSchema>['body'];

// BULK-ADMIN (item 17): same 1-100 id-array cap as
// admin.validation.ts's bulkIdsSchema — kept as its own local const
// rather than importing across modules for a single shared array
// shape (sellers.validation.ts has no other dependency on
// admin.validation.ts, and duplicating one z.array(...).min(1).max(100)
// line avoids introducing one just for this).
const bulkSellerIdsSchema = z.array(z.string().min(1)).min(1, 'At least one id is required').max(100);

export const bulkVerifySellersSchema = z.object({
  body: z.object({ sellerProfileIds: bulkSellerIdsSchema, verified: z.boolean() }),
});

export const bulkSuspendSellersSchema = z.object({
  body: z.object({
    sellerProfileIds: bulkSellerIdsSchema,
    suspended: z.boolean(),
    reason: z.string().trim().min(3).max(500).optional(),
  }).superRefine((body, ctx) => {
    if (body.suspended && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason is required when suspending sellers',
        path: ['reason'],
      });
    }
  }),
});

export type BulkVerifySellersInput = z.infer<typeof bulkVerifySellersSchema>['body'];
export type BulkSuspendSellersInput = z.infer<typeof bulkSuspendSellersSchema>['body'];
