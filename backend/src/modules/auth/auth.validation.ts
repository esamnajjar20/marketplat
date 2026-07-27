import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,15}$/, 'Invalid phone number')
      .optional(),
    city: z.string().max(100).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

/**
 * FIX DEAD-08: refreshSchema (and its derived RefreshInput type) removed.
 * Both were dead code left over from before the httpOnly-cookie refresh
 * flow (PROD-FIX-15) — refreshToken is now read from the cookie via
 * getRefreshTokenFromCookie(req) in auth.controller.ts, never from a
 * request body, so a schema validating a `body.refreshToken` field no
 * longer matches how refresh is actually handled and could mislead a
 * future maintainer into thinking the body still carries a token.
 */
export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token:       z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword:     z.string().min(8, 'New password must be at least 8 characters').max(100),
  }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
