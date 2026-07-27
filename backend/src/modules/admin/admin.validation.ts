import { z } from 'zod';
import { AdStatus, Role } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

export const adminGetAdsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z.nativeEnum(AdStatus).optional(),
    userId: z.string().optional(),
    // BUGFIX: AdminAdsTable's search box already sent `q` on every
    // request — Zod silently stripped it since it wasn't declared
    // here, so the search box looked functional but filtered nothing.
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export const adminGetUsersSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    isActive: z
      .enum(['true', 'false'])
      .optional()
      .transform(v => (v === undefined ? undefined : v === 'true')),
    // BUGFIX: same issue as adminGetAdsSchema's `q` above — silently
    // stripped, so AdminUsersTable's search box did nothing.
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export const setFeaturedSchema = z.object({
  body: z.object({ isFeatured: z.boolean() }),
});

export const setPinnedSchema = z.object({
  body: z.object({ isPinned: z.boolean() }),
});

export const toggleActiveSchema = z.object({
  body: z.object({ isActive: z.boolean() }),
});

// FIX AUDIT-V3-05: AuditEventType.ROLE_CHANGED existed in the schema
// with no code ever triggering it, and there was no way for an admin to
// promote/demote a user without editing the database directly. Only
// USER/ADMIN are valid Role values — z.nativeEnum keeps this in sync
// with the Prisma enum automatically if it's ever extended.
export const changeRoleSchema = z.object({
  body: z.object({ role: z.nativeEnum(Role) }),
});

export type AdminGetAdsQuery = z.infer<typeof adminGetAdsSchema>['query'];
export type AdminGetUsersQuery = z.infer<typeof adminGetUsersSchema>['query'];
