import { prisma } from '../../config/prisma';
import { Prisma, User } from '@prisma/client';
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
// FEAT-GOOGLE-COMPLETE-PROFILE: needsProfileCompletion?: boolean added
// so usersService.updateMe can clear the flag (set it false) in the
// same prisma.user.update call that saves the submitted city, rather
// than a second round-trip.
type UpdateUserData = UpdateProfileInput & { avatarUrl?: string; needsProfileCompletion?: boolean };

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
  // FEAT-GOOGLE-COMPLETE-PROFILE: exposed so GET/PATCH /users/me let
  // the frontend know whether to route the user through
  // /complete-profile (see schema.prisma's comment on the column).
  needsProfileCompletion: true,
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
  // FIX FEAT-EMAIL-VERIFY: added to the User model by the
  // 20260921120000_add_email_verification migration. SafeUser is
  // Omit<User, 'passwordHash'>, so every SafeUser-typed query result
  // must carry these two columns or TypeScript rejects the assignment
  // (the compiler caught exactly that on the first type-check).
  emailVerified: true,
  emailVerifiedAt: true,
  // SALES-COST-TRACKING-01: added to the User model by the
  // 20261006190000_sales_cost_tracking migration. SafeUser is
  // Omit<User, 'passwordHash'>, so every SafeUser-typed query result
  // must carry this column or TypeScript rejects the assignment.
  salesCostTrackingEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

// SEC-FIX: PII leak — GET /users/:id is a PUBLIC, unauthenticated route.
// It must never expose email, phone, role, isActive or updatedAt for
// other users. Only the fields below are safe to show on a public profile.
//
// UNIFIED-PROFILE: sellerProfile (and its storeDetails /
// serviceProviderDetails children) is now included so /profile/:id can
// render seller/store/service tabs without three extra round trips to
// /sellers/:id, /stores/:id, /service-providers/:id. Every nested select
// mirrors the field allowlist each of those endpoints already exposes
// publicly (sellers.repository.ts's findPublicProfile, stores.repository.ts's
// findPublicById, service-providers.repository.ts's findPublicById) — no
// field reaches this response that wasn't already public elsewhere.
// storeDetails is additionally gated to status: 'ACTIVE' since a
// PENDING/BLOCKED store (see StoreStatus in schema.prisma —
// stores.service.ts's own getPublicStore has no such gate today, but a
// pending store has no business appearing on a public profile before an
// admin has approved it) shouldn't surface here.
const publicUserSelect = {
  id: true,
  name: true,
  city: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
  // S-05: count only ACTIVE ads on the public profile, same rule
  // getUserAds already enforces — otherwise this leaks SOLD/removed count.
  _count: { select: { ads: { where: { status: 'ACTIVE' } } } },
  sellerProfile: {
    select: {
      id: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      verified: true,
      trustScore: true,
      averageRating: true,
      totalRatings: true,
      activeAds: true,
      // PLAN-P1-1: previously omitted from the public projection —
      // only MySellerProfileCard (owner-only) could see it. Needed so
      // ProfileBadges can show a "الأكثر مبيعاً" badge to visitors;
      // was otherwise sitting on the model unused by anyone but the
      // seller themselves.
      totalSales: true,
      // PLAN-P1-2: computed by scripts/updateSellerResponseMetrics.ts
      // (was previously always null — nothing wrote to either
      // column). Exposed here so ProfileBadges can show "سريع
      // الاستجابة" for sellers the job has actually measured.
      responseRate: true,
      responseTimeMinutes: true,
      joinedSellingAt: true,
      paymentMethods: true,
      suspended: true,
      // UNIFIED-PROFILE: totalRatings only counts ad-seller ratings
      // (SellerRating) — a seller with service reviews but zero ad
      // ratings still needs the "التقييمات" tab to appear, so this
      // separately counts ServiceReview rows for the ratings-tab gate.
      _count: { select: { serviceReviews: true } },
      storeDetails: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          description: true,
          logoUrl: true,
          coverImageUrl: true,
          city: true,
          plan: true,
          phone: true,
          _count: { select: { followers: true, products: true } },
          // UNIFY-PAYMENTS-STORES: no paymentMethods here anymore —
          // read sellerProfile.paymentMethods above instead (the same
          // single source of truth serviceProviderDetails already uses).
        },
      },
      serviceProviderDetails: {
        select: {
          id: true,
          businessName: true,
          businessType: true,
          logoUrl: true,
          description: true,
          serviceAreaCities: true,
          availabilityStatus: true,
          completedRequestsCount: true,
          // S3: public contact for call / WhatsApp (same visibility as store phone on store page)
          contactPhone: true,
          // UNIFY-PAYMENTS: no paymentMethods here anymore — read
          // sellerProfile.paymentMethods above instead (the single
          // source of truth for both seller and service-provider).
        },
      },
    },
  },
} as const;

// Derived directly from publicUserSelect (Prisma.UserGetPayload) rather
// than hand-written, so this type can never drift from what the query
// actually returns — same convention as StoreWithSellerAndCounts in
// stores.repository.ts and SellerProfileWithAds in sellers.repository.ts.
type PublicUserQueryResult = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
export type PublicSellerProfile = NonNullable<PublicUserQueryResult['sellerProfile']>;
export type PublicUser = PublicUserQueryResult;

export const usersRepository = {
  findById: async (id: string): Promise<SafeUser | null> =>
    prisma.user.findUnique({ where: { id }, select: safeUserSelect }),

  // SEC-FIX: used by the public GET /users/:id endpoint — excludes PII.
  findPublicById: async (id: string): Promise<(PublicUser & { isActive: boolean }) | null> =>
    prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect, isActive: true } as const,
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

  // FIX USERS-DEAD-CODE-01: deleteById removed. Full-repo grep
  // confirmed zero callers — usersService.deleteMe does its own
  // transaction (anonymize + ad cascade), and authRepository has its
  // own deleteById for the register-orphan cleanup path. Leaving a
  // second, subtly-different definition of "delete user" here was a
  // trap: the next maintainer reaching for it would get a soft
  // isActive-only flip with none of the anonymization or Cloudinary
  // cleanup deleteMe now performs.
};
