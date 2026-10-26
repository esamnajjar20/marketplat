import { prisma } from '../../config/prisma';
import { User } from '@prisma/client';
import { handlePrismaError } from '../../shared/utils/prismaErrors';

/**
 * every email that enters or leaves this
 * repository is lowercased and trimmed once, here, so that
 * register("User@Example.com") and login("user@example.com") agree on
 * what "the same email" means. Before this, the only normalization
 * in the auth flow was Google's own lowercase-ing of OAuth email
 * claims — local registration stored whatever the user typed, and
 * every lookup compared raw strings against that. Two consequences:
 *
 *   1. A user who registered on a phone whose keyboard
 *      auto-capitalized the first letter would silently hold an
 *      account keyed on "User@Example.com"; their next login typed
 *      as "user@example.com" would fail with Invalid credentials,
 *      and no amount of password reset would recover it — the reset
 *      email path looks up the same lowercased address.
 *
 *   2. A second account could be created with the mixed-case variant
 *      of an existing email (the P2002 unique constraint on User.email
 *      is case-sensitive in Postgres), leaving the two accounts
 *      unaware of each other and letting an attacker who knows a
 *      victim's email squat the "correct" spelling.
 *
 * Applied at the repository boundary rather than at each call site
 * so a future endpoint (or a new caller in auth.service.ts) cannot
 * accidentally bypass it. This does not migrate existing rows — the
 * handful of already-mis-cased accounts in production keep working
 * exactly as before (their stored string still matches what they
 * typed); the forward-looking. If a data migration is ever
 * needed, it would be a separate, reviewable step.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const authRepository = {
  findByEmail: async (email: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { email: normalizeEmail(email) } }),

  findByPhone: async (phone: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { phone } }),

  // looks up a user by their linked Google account id.
  // Distinct from findByEmail — a user can exist with an email but no
  // googleId yet (a local account that hasn't linked Google), so
  // these answer different questions; authService.loginWithGoogle()
  // deliberately checks both, in order.
  findByGoogleId: async (googleId: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { googleId } }),

  // D-04: wrap create in handlePrismaError to catch P2002 race conditions
  // (two simultaneous registrations with same email/phone)
  create: async (data: {
    name: string;
    email: string;
    passwordHash: string;
    phone?: string;
    city?: string;
  }): Promise<User> => {
    try {
      return await prisma.user.create({
        data: { ...data, email: normalizeEmail(data.email) },
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  },

  // creates a brand-new user from a Google profile —
  // only used when neither findByGoogleId nor findByEmail found an
  // existing account (see authService.loginWithGoogle()). No
  // passwordHash: this account has no local password until/unless a
  // future "add a password" flow sets one (out of scope here) —
  // passwordHash is nullable specifically to support this (see
  // schema.prisma's comment). Deliberately does NOT
  // create a SellerProfile — that stays an explicit, separate opt-in
  // via POST /sellers regardless of which auth provider created the
  // account, unchanged from existing local-registration behavior.
  createWithGoogle: async (data: {
    name: string;
    email: string;
    googleId: string;
    avatarUrl?: string;
  }): Promise<User> => {
    try {
      return await prisma.user.create({
        data: {
          name: data.name,
          email: normalizeEmail(data.email),
          googleId: data.googleId,
          avatarUrl: data.avatarUrl,
          provider: 'google',
          // FEAT-GOOGLE-COMPLETE-PROFILE: Google never supplies a
          // city, so this brand-new account is flagged for the
          // /complete-profile step (see schema.prisma's comment on
          // the column) — cleared once they submit it via the
          // existing PATCH /users/me.
          needsProfileCompletion: true,
          // Google already verified this
          // address before the OAuth flow completed
          // (google.strategy.ts's extractGoogleProfile requires
          // email_verified === true), so we never send a second
          // "confirm your email" round trip. Local registrations
          // default to false and go through the /verify-email flow.
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  },

  // links a Google identity onto an existing local
  // account matched by email (see authService.loginWithGoogle()'s
  // link-by-email path). Deliberately does NOT touch passwordHash —
  // the existing local user keeps their password working exactly as
  // before; linking Google just adds a second way in, never removes
  // the first. `provider` reflects the most recently used identity,
  // matching that column's documented meaning in schema.prisma (not
  // "google-only", just "last used to sign in").
  linkGoogleAccount: async (userId: string, googleId: string): Promise<User> => {
    try {
      return await prisma.user.update({
        where: { id: userId },
        data: { googleId, provider: 'google' },
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  },

  // compensating delete used by register() when issueSession
  // (Redis: refresh token save + user cache warm) fails after the
  // PostgreSQL user row was already created. Without this, a Redis
  // failure mid-registration leaves an orphaned user with no valid
  // session who can never register again (email already taken) and
  // can never log in (no way to reach a working session for them either,
  // since the same issueSession path is reused by login()). Best-effort
  // by design — if this delete itself fails, that failure is logged and
  // swallowed by the caller rather than masking the original error.
  deleteById: async (userId: string): Promise<void> => {
    await prisma.user.delete({ where: { id: userId } });
  },
};
