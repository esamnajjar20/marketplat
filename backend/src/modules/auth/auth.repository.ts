import { prisma } from '../../config/prisma';
import { User } from '@prisma/client';
import { handlePrismaError } from '../../shared/utils/prismaErrors';

export const authRepository = {
  findByEmail: async (email: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { email } }),

  findByPhone: async (phone: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { phone } }),

  // FIX OAUTH-01: looks up a user by their linked Google account id.
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
      return await prisma.user.create({ data });
    } catch (error) {
      return handlePrismaError(error);
    }
  },

  // FIX OAUTH-01: creates a brand-new user from a Google profile —
  // only used when neither findByGoogleId nor findByEmail found an
  // existing account (see authService.loginWithGoogle()). No
  // passwordHash: this account has no local password until/unless a
  // future "add a password" flow sets one (out of scope here) —
  // passwordHash is nullable specifically to support this (see
  // schema.prisma's FIX OAUTH-01 comment). Deliberately does NOT
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
          email: data.email,
          googleId: data.googleId,
          avatarUrl: data.avatarUrl,
          provider: 'google',
        },
      });
    } catch (error) {
      return handlePrismaError(error);
    }
  },

  // FIX OAUTH-01: links a Google identity onto an existing local
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
};
