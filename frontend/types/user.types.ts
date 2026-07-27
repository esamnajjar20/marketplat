/**
 * User types.
 * Mirrors backend Prisma User model and SafeUser select.
 */

export type UserRole = 'USER' | 'ADMIN';

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
