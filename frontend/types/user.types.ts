/**
 * User types.
 * Mirrors backend Prisma User model and SafeUser select.
 */

// FIX BUG-XX: this used to redeclare UserRole as 'USER' | 'ADMIN',
// stale relative to auth.types.ts's correct 4-value union ('USER' |
// 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN', kept in sync with the
// backend Prisma Role enum since Gap #20). No current code imported
// UserRole from here, but `User.role: UserRole` below inherited the
// narrow type, and any exhaustive switch added later on a `User`
// object's `.role` would silently miss MODERATOR/SUPER_ADMIN. Re-
// exporting from auth.types.ts makes it a single source of truth
// instead of two definitions that can drift again.
export type { UserRole } from './auth.types';

/** Full user — returned by GET /users/me */
/** FIX FEAT-02: matches NotificationSettingsForm.tsx's SETTINGS keys
 * and the backend's updateNotificationPreferencesSchema exactly. */
export interface NotificationPreferences {
  newMessage:   boolean;
  adViews:      boolean;
  favAdUpdated: boolean;
  promotions:   boolean;
}

export interface User {
  id:        string;
  name:      string;
  email:     string;
  phone:     string | null;
  city:      string | null;
  bio:       string | null;
  avatarUrl: string | null;
  role:      UserRole;
  isActive:  boolean;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

/** Public profile — returned by GET /users/:id (no email/phone) */
export type PublicUser = Pick<User, 'id' | 'name' | 'city' | 'bio' | 'avatarUrl' | 'createdAt'> & {
  _count: { ads: number };
};

/**
 * Payload for PATCH /users/me.
 *
 * L-6 (audit fix): avatarUrl removed — it mirrored the backend's
 * updateProfileSchema, which dropped the same field because it was
 * dead: ProfileSettingsForm.tsx never sent it, and avatar changes go
 * through the separate POST /users/me/avatar upload flow instead (see
 * users.api.ts's uploadAvatar / useUpdateAvatar). See
 * users.validation.ts (backend) for the full reasoning.
 */
export interface UpdateProfilePayload {
  name?:      string;
  city?:      string;
  bio?:       string;
  phone?:     string;
}
