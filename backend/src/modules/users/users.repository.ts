import { prisma } from '../../config/prisma';
import { User } from '@prisma/client';
import { UpdateProfileInput, UpdateNotificationPreferencesInput } from './users.validation';

export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * avatarUrl is deliberately absent from UpdateProfileInput (see
 * users.validation.ts) — it's not reachable via the public PATCH
 * /users/me body. It's only ever written server-side by
 * uploadAvatar() below, after the file has been uploaded to
 * Cloudinary. This type extends the public input with that one
 * internal-only field, rather than widening the Zod schema itself.
 */
type UpdateUserData = UpdateProfileInput & { avatarUrl?: string };

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  city: true,
  bio: true,
  avatarUrl: true,
  isActive: true,
  // FIX FEAT-02: needed so GET /users/me actually returns the user's
  // saved preferences — NotificationSettingsForm.tsx loads its initial
  // toggle state from here instead of always defaulting to hardcoded
  // values regardless of what was previously saved.
  notificationPreferences: true,
  // FIX OAUTH-01: SafeUser (Omit<User, 'passwordHash'>) picked up these
  // two columns as soon as the Google OAuth migration added them to the
  // User model — select them here too, or every SafeUser-typed query
  // result is structurally missing them.
  provider: true,
  googleId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// SEC-FIX: PII leak — GET /users/:id is a PUBLIC, unauthenticated route.
// It must never expose email, phone, role, isActive or updatedAt for
// other users. Only the fields below are safe to show on a public profile.
const publicUserSelect = {
  id: true,
  name: true,
  city: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: string;
  name: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
};

export const usersRepository = {
  findById: async (id: string): Promise<SafeUser | null> =>
    prisma.user.findUnique({ where: { id }, select: safeUserSelect }),

  // SEC-FIX: used by the public GET /users/:id endpoint — excludes PII.
  findPublicById: async (id: string): Promise<(PublicUser & { isActive: boolean }) | null> =>
    prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect, isActive: true },
    }),

  findByPhone: async (phone: string): Promise<SafeUser | null> =>
    prisma.user.findUnique({ where: { phone }, select: safeUserSelect }),

  update: async (id: string, data: UpdateUserData): Promise<SafeUser> =>
    prisma.user.update({ where: { id }, data, select: safeUserSelect }),

  /**
   * FIX FEAT-02: merges the partial update into the existing JSON value
   * rather than overwriting it — so PATCHing just `{ promotions: true }`
   * doesn't wipe out the user's other saved preferences. Postgres's `||`
   * jsonb concatenation operator does this in one atomic statement
   * (right-hand operand's keys win on conflict), avoiding a
   * read-then-write race between two concurrent preference updates.
   */
  updateNotificationPreferences: async (
    id: string,
    patch: UpdateNotificationPreferencesInput,
  ): Promise<SafeUser> => {
    await prisma.$executeRaw`
      UPDATE "users"
      SET "notificationPreferences" = "notificationPreferences" || ${JSON.stringify(patch)}::jsonb
      WHERE "id" = ${id}
    `;
    const updated = await prisma.user.findUnique({ where: { id }, select: safeUserSelect });
    if (!updated) throw new Error('User disappeared during notification preferences update');
    return updated;
  },

  deleteById: async (id: string): Promise<void> => {
    await prisma.user.update({ where: { id }, data: { isActive: false } });
  },
};
