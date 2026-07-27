import { z } from 'zod';

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
  }),
});

export type SuspendSellerInput = z.infer<typeof suspendSellerSchema>['body'];
