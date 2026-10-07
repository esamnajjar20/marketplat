import { z } from 'zod';
import { AdStatus } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

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

// / Gap #20 (admin permission tiers): AuditEventType.
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

// the three catalog endpoints
// (products / service-listings / open-requests) were parsing their
// query strings by hand in the controller — `req.query.limit ? Number(...)`
// with no upper bound, `req.query.status as ...` with a TypeScript
// cast but no runtime check, and `q` with no length cap. The service
// layer has since gained its own Math.min(100, ...) on limit, but the
// status/q casts still mean an unknown status or an oversized q would
// flow straight into the Prisma where clause. Added proper Zod schemas
// matching the shape of adminGetAdsSchema / adminGetUsersSchema so
// those three endpoints reject bad input at the edge instead of
// relying on the service to be defensive.
const productStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'DELETED']);
const serviceListingStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'DELETED']);
const openRequestStatusEnum = z.enum(['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED']);
const openRequestTypeEnum = z.enum(['SERVICE', 'PRODUCT', 'RENTAL']);

export const adminGetProductsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: productStatusEnum.optional(),
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export const adminGetServiceListingsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: serviceListingStatusEnum.optional(),
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export const adminGetOpenRequestsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: openRequestStatusEnum.optional(),
    type: openRequestTypeEnum.optional(),
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

// same reasoning applied to the two
// status-mutating endpoints. Both used a bare TypeScript cast on
// req.body.status (`as 'ACTIVE' | 'PAUSED' | 'DELETED'`) which the
// compiler accepted but enforced nothing at runtime — an admin client
// (or a future script) could send `{ status: '' }` and it would
// reach Prisma's update call. Zod native-enum rejects it with a clear
// 400 instead of an opaque 500 from the DB driver. Also declares the
// optional reason, same shape already used by adminCancelOpenRequest.
export const setProductStatusSchema = z.object({
  body: z.object({
    status: productStatusEnum,
    reason: z.string().trim().min(3).max(500).optional(),
  }),
});

export const setServiceListingStatusSchema = z.object({
  body: z.object({
    status: serviceListingStatusEnum,
    reason: z.string().trim().min(3).max(500).optional(),
  }),
});

// admin ad deletion (single and bulk) is the
// one admin action whose audit trail benefits most from a reason —
// a fraud takedown, a legal request, or a policy violation should all
// be distinguishable in the audit log without cross-referencing other
// systems. Currently the audit row carries only the adId, so all three
// cases look identical months later. Reason is optional for now (the
// frontend doesn't send it yet), but the schema is in place so the
// plumbing is a frontend-only change when that's added.
export const deleteAdSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(3).max(500).optional(),
  }),
});

export type AdminGetProductsQuery = z.infer<typeof adminGetProductsSchema>['query'];
export type AdminGetServiceListingsQuery = z.infer<typeof adminGetServiceListingsSchema>['query'];
export type AdminGetOpenRequestsQuery = z.infer<typeof adminGetOpenRequestsSchema>['query'];
export type SetProductStatusInput = z.infer<typeof setProductStatusSchema>['body'];
export type SetServiceListingStatusInput = z.infer<typeof setServiceListingStatusSchema>['body'];
export type DeleteAdInput = z.infer<typeof deleteAdSchema>['body'];

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
  body: z.object({
    adIds: bulkIdsSchema,
    // optional for now — see deleteAdSchema
    // above for the full reasoning. When the frontend starts
    // supplying a reason on the bulk bar, this is where it lands.
    reason: z.string().trim().min(3).max(500).optional(),
  }),
});

export const bulkToggleUserActiveSchema = z.object({
  body: z.object({ userIds: bulkIdsSchema, isActive: z.boolean() }),
});

export type BulkSetAdFeaturedInput = z.infer<typeof bulkSetAdFeaturedSchema>['body'];
export type BulkSetAdPinnedInput = z.infer<typeof bulkSetAdPinnedSchema>['body'];
export type BulkDeleteAdsInput = z.infer<typeof bulkDeleteAdsSchema>['body'];
export type BulkToggleUserActiveInput = z.infer<typeof bulkToggleUserActiveSchema>['body'];


export const adminGetServiceRequestDisputesSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export const adminResolveServiceRequestDisputeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    resolution: z.enum(['COMPLETED', 'CANCELLED']),
    note: z.string().trim().min(3).max(1000).optional(),
  }),
});
