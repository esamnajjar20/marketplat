import { z } from 'zod';
import { AdStatus } from '@prisma/client';

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

// FIX AUDIT-V3-05 / Gap #20 (admin permission tiers): AuditEventType.
// ROLE_CHANGED existed in the schema with no code ever triggering it,
// and there was no way for an admin to promote/demote a user without
// editing the database directly. Restricted to USER/MODERATOR/ADMIN —
// SUPER_ADMIN is deliberately excluded from the assignable set here
// (not just checked later in adminService.changeRole): it's a
// break-glass role assigned directly in the database, never through
// this endpoint, for anyone. Rejecting it at the schema gives a clear
// 400 instead of a 403 surfacing from deep in the service layer.
const assignableRoleSchema = z.enum(['USER', 'MODERATOR', 'ADMIN']);

export const changeRoleSchema = z.object({
  body: z.object({ role: assignableRoleSchema }),
});

export type AdminGetAdsQuery = z.infer<typeof adminGetAdsSchema>['query'];
export type AdminGetUsersQuery = z.infer<typeof adminGetUsersSchema>['query'];

// BULK-ADMIN (item 17): shared 1-100 id-array shape, same cap as
// reports.validation.ts's bulkUpdateReportStatusSchema and for the
// same reason — never let a single bulk request become a full-table
// operation; an admin clearing more than that does it in a couple of
// requests instead.
const bulkIdsSchema = z.array(z.string().min(1)).min(1, 'At least one id is required').max(100);

export const bulkSetAdFeaturedSchema = z.object({
  body: z.object({ adIds: bulkIdsSchema, isFeatured: z.boolean() }),
});

export const bulkSetAdPinnedSchema = z.object({
  body: z.object({ adIds: bulkIdsSchema, isPinned: z.boolean() }),
});

export const bulkDeleteAdsSchema = z.object({
  body: z.object({ adIds: bulkIdsSchema }),
});

export const bulkToggleUserActiveSchema = z.object({
  body: z.object({ userIds: bulkIdsSchema, isActive: z.boolean() }),
});

export type BulkSetAdFeaturedInput = z.infer<typeof bulkSetAdFeaturedSchema>['body'];
export type BulkSetAdPinnedInput = z.infer<typeof bulkSetAdPinnedSchema>['body'];
export type BulkDeleteAdsInput = z.infer<typeof bulkDeleteAdsSchema>['body'];
export type BulkToggleUserActiveInput = z.infer<typeof bulkToggleUserActiveSchema>['body'];
