import { z } from 'zod';

/**
 * FIX PASSWORD-STRENGTH-01: 8-char minimum alone lets anything from
 * "12345678" to "password" through — a real problem on a marketplace
 * whose users sign up in bulk and have every incentive to pick the
 * shortest, easiest string possible. A full password-strength library
 * (zxcvbn etc.) would be overkill here; matching against a compact
 * list of the most abused passwords from public breach corpora catches
 * the overwhelming majority of real cases (things like "12345678",
 * "password", "qwerty") with zero dependencies and no scoring
 * ambiguity. Comparison is lowercased so "Password123" and
 * "password123" collapse to the same entry.
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password!', 'passw0rd',
  'p@ssword', 'p@ssw0rd', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'qwertyuiop', 'qwer1234', 'qwerty1',
  'abc12345', 'abc123456', 'a1b2c3d4', '1q2w3e4r', 'zaq12wsx',
  '11111111', '00000000', '12121212', '12341234', '123123123',
  'iloveyou', 'iloveyou1', 'sunshine', 'princess', 'monkey123',
  'welcome', 'welcome1', 'welcome123', 'letmein', 'letmein1',
  'admin123', 'admin1234', 'administrator', 'root1234',
  'football', 'baseball', 'superman', 'batman123', 'whatever',
  'trustno1', 'master123', 'shadow123', 'michael1', 'jordan23',
  'asdfghjkl', 'zxcvbnm123', 'qazwsxedc', '1qaz2wsx',
  'palestine', 'gaza', 'غزة', 'فلسطين', 'محمد', 'احمد',
]);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be at most 100 characters')
  .refine(
    (v) => !COMMON_WEAK_PASSWORDS.has(v.toLowerCase()),
    'This password is too common — please choose a stronger one.',
  );

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email('Invalid email format'),
    password: passwordSchema,
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
    newPassword: passwordSchema,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword:     passwordSchema,
  }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput  = z.infer<typeof resetPasswordSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
