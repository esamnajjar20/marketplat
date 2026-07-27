import { z } from 'zod';

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{9,15}$/, 'Invalid phone number')
      .optional(),
    city: z.string().max(100).optional(),
    bio: z.string().max(500).optional(),
    // L-6 (audit fix): avatarUrl removed. It was never actually
    // reachable from the frontend — ProfileSettingsForm.tsx only ever
    // sends name/phone/city/bio, and avatar changes go through the
    // dedicated POST /users/me/avatar upload flow (uploadAvatar in
    // users.service.ts), which uploads to Cloudinary server-side and
    // writes avatarUrl directly via usersRepository.update, bypassing
    // this schema entirely. Keeping it here was dead code that also
    // doubled as an unused attack surface: any client could set
    // avatarUrl to an arbitrary URL on an allowed CDN domain — one it
    // never uploaded to via uploadAvatar — without going through that
    // flow's delete-old-avatar bookkeeping. The safeUrlSchema/
    // ALLOWED_AVATAR_DOMAINS helpers that validated it are removed too
    // (uploadAvatar gets its URL from Cloudinary's own upload response,
    // not from user input, so it never needed them).
  }),
});

export const getUserByIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword:     z.string().min(8, 'New password must be at least 8 characters').max(100),
  }),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];

// FIX FEAT-02: keys must match NotificationSettingsForm.tsx's SETTINGS
// array exactly (newMessage/adViews/favAdUpdated/promotions). All
// optional so the frontend can PATCH a partial update (e.g. toggling
// just one switch) without resending every key.
export const updateNotificationPreferencesSchema = z.object({
  body: z.object({
    newMessage: z.boolean().optional(),
    adViews: z.boolean().optional(),
    favAdUpdated: z.boolean().optional(),
    promotions: z.boolean().optional(),
  }).refine(obj => Object.keys(obj).length > 0, {
    message: 'At least one preference must be provided',
  }),
});

export type UpdateNotificationPreferencesInput =
  z.infer<typeof updateNotificationPreferencesSchema>['body'];
