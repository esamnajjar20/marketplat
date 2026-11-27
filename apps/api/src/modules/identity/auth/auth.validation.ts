import { z } from 'zod';
import { emailSchema, loginCredentialsSchema, passwordSchema, registerBodySchema } from '@marketplat/contracts';

/** Runtime request validation is sourced from @marketplat/contracts. */
export const registerSchema = z.object({ body: registerBodySchema });

export const loginSchema = z.object({ body: loginCredentialsSchema });

/**
 * refreshSchema (and its derived RefreshInput type) removed.
 * Both were dead code left over from before the httpOnly-cookie refresh
 * flow () — refreshToken is now read from the cookie via
 * getRefreshTokenFromCookie(req) in auth.controller.ts, never from a
 * request body, so a schema validating a `body.refreshToken` field no
 * longer matches how refresh is actually handled and could mislead a
 * future maintainer into thinking the body still carries a token.
 */
export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// consumed by POST /auth/verify-email. Token
// is the 64-char hex string generated in auth.service.ts's register()
// and resendVerification(); min(1) is defensive — the service checks
// existence in DB anyway.
export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, 'Verification token is required'),
  }),
});

// POST /auth/resend-verification takes no body
// — the user is identified by their auth token. Empty schema for
// symmetry with the middleware chain.
export const resendVerificationSchema = z.object({
  body: z.object({}).optional(),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordSchema,
  }),
});

// The password schema is exported by the shared contract package and reused
// directly by the users module for change-password validation.

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];


/** Start a Google step-up flow for deleting an authenticated native account. */
export const mobileGoogleDeleteStartSchema = z.object({
  body: z.object({
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid PKCE code challenge'),
  }),
});

/** One-time native OAuth exchange. The ticket is short-lived and bound to a PKCE verifier. */
export const mobileGoogleExchangeSchema = z.object({
  body: z.object({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid OAuth ticket'),
    verifier: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/, 'Invalid PKCE verifier'),
  }),
});
