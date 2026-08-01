import { z } from 'zod';
import { AdStatus, AdCondition } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

/**
 * FIX INTEG-05: isNegotiable used plain z.boolean(), which rejects
 * anything that isn't already a real JS boolean. createAd's frontend
 * caller (adsApi.create) sends multipart/form-data (required for the
 * image files), and multer puts every non-file field into req.body as
 * a raw string — so isNegotiable arrived as the literal string "true"
 * or "false", and z.boolean().parse("true"/"false") always threw a 400
 * ("Expected boolean, received string"). Every attempt to create an ad
 * failed outright, regardless of the checkbox's actual state.
 *
 * z.coerce.boolean() is NOT the fix here — per JS semantics, any
 * non-empty string coerces to true, so z.coerce.boolean().parse("false")
 * would silently produce `true`, which is worse than the outright
 * rejection this replaces. This preprocessor treats the exact strings
 * "true"/"false" explicitly and passes real booleans (or undefined)
 * through unchanged — real booleans are what PATCH /ads/:id's
 * plain-JSON body already sends, since updateAd's frontend caller does
 * NOT use FormData (see adsApi.update), so it never hit this bug, but
 * gets the same defensive handling here regardless of caller.
 *
 * Applied as a raw preprocess step ahead of z.boolean() rather than
 * wrapping an already-built schema, so it composes cleanly with
 * whatever's chained after it (.default(...), .optional(), etc.)
 * without fighting Zod's type inference over which wrapper type
 * (ZodDefault vs ZodOptional vs plain ZodBoolean) it received.
 */
const preprocessFormBoolean = (value: unknown) => {
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
};

export const createAdSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(200),
    description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
    // D-03: Prisma Decimal(10,2) — use string coercion to avoid IEEE 754 float precision loss
    price: z.coerce
      .number()
      .positive('Price must be a positive number')
      .multipleOf(0.01, 'Price cannot have more than 2 decimal places')
      .optional(),
    city: z.string().min(2).max(100),
    categoryId: z.string().optional(),
    condition: z.nativeEnum(AdCondition).optional(),
    isNegotiable: z.preprocess(preprocessFormBoolean, z.boolean().default(false)),
  }),
});

export const updateAdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  // FIX FAV-02 (plan's "images:[] validation" item): verified this
  // schema has no `images` field, and nothing in this file uses
  // .passthrough()/.strict() to change Zod's default behavior — an
  // object schema without .passthrough() silently STRIPS any key not
  // explicitly declared, before the parsed body ever reaches
  // adsService.updateAd/adsRepository.update. A client sending
  // `images: []` (or any images value) in a PATCH /ads/:id body has
  // that field dropped here; it can never reach the Prisma `data`
  // object and can never overwrite the images array. Images are only
  // ever mutated through the dedicated addImages (atomic append,
  // capped at 10, lock-guarded — see ads.service.ts) and removeImage
  // (single-image removal) endpoints, never through this general PATCH.
  // No code change was needed for this item — recorded here so a
  // future pass doesn't re-flag it without re-checking.
  body: z.object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().min(10).max(5000).optional(),
    price: z.coerce.number().positive().multipleOf(0.01).nullable().optional(),
    city: z.string().min(2).max(100).optional(),
    categoryId: z.string().nullable().optional(),
    condition: z.nativeEnum(AdCondition).nullable().optional(),
    isNegotiable: z.preprocess(preprocessFormBoolean, z.boolean()).optional(),
    status: z.nativeEnum(AdStatus).optional(),
  }),
});

// L-3 (audit fix): single source of truth for which columns sortBy may
// select. Previously this enum here and the switch-like ternary chain
// in ads.repository.ts's raw-SQL search branch were two independently
// maintained lists that happened to agree — the ORM path's
// `{ [sortBy]: sortOrder }` picks up any new value automatically, but
// the raw-SQL path requires an explicit new `sortBy === 'x' ? ... :`
// branch or it silently falls back to sorting by createdAt (exactly
// the class of bug FIX H-1 above already fixed once for 'views').
// Exporting this array lets ads.repository.ts build its raw-SQL column
// map FROM this list (see AD_SORT_COLUMN_SQL there) instead of
// hand-copying it, so the two paths can no longer drift apart.
export const AD_SORT_FIELDS = ['createdAt', 'price', 'views'] as const;
export type AdSortField = (typeof AD_SORT_FIELDS)[number];

export const getAdsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    city: z.string().max(100).optional(),
    categoryId: z.string().optional(),
    condition: z.nativeEnum(AdCondition).optional(),
    minPrice: optionalQueryNumber(z.number().min(0)),
    maxPrice: optionalQueryNumber(z.number().min(0)),
    // FIX AUDIT-V3-08: z.string().optional() alone still accepts an
    // explicit empty string ("") — different from the field being
    // absent. An empty search= falls through to the ORM/ILIKE path in
    // ads.repository.ts (since `if (search)` is false for ""), which
    // isn't dangerous, but it's relying on a JS truthiness accident
    // rather than the validation layer making an explicit decision.
    // .min(1) rejects "" outright with a clear 400, leaving "absent"
    // (undefined) as the only way to mean "no search filter."
    search: z.string().min(1).max(200).optional(),
    // FIX H-1: 'views' added — the frontend's AD_SORT_OPTIONS ("الأكثر
    // مشاهدة" / Most Viewed) has always sent sortBy=views, but this
    // enum only accepted createdAt/price, so every selection of that
    // sort option failed Zod validation with a 400, silently breaking
    // a fully-built, user-visible sort control. ads.repository.ts's
    // orderBy already applies `{ [sortBy]: sortOrder }` generically, so
    // adding 'views' here is sufficient — no repository change needed.
    sortBy: z.enum(AD_SORT_FIELDS).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

// FIX D-24 / I-08: GET /ads/me's "status" filter tabs (All/Active/Sold/
// Deleted) in MyAdsList.tsx were fully built on the frontend but had no
// effect — getAdsSchema (shared with the public /ads endpoint) has no
// `status` field, so Zod silently stripped it before it ever reached
// findManyByUserId, which only ever applied a hardcoded internal
// 'ACTIVE' filter for public-profile use, never a user-supplied value.
//
// This schema is deliberately separate from getAdsSchema (not just an
// extension reused on the public endpoint). All three AdStatus values
// are accepted here, including DELETED — unlike the public /ads
// endpoint, this query is always scoped to the authenticated user's own
// ads (userId is fixed server-side in findManyByUserId's WHERE clause,
// never taken from the request), so a user seeing their own
// soft-deleted ads is not a cross-user data leak the way an unscoped
// DELETED filter on the public endpoint would be.
export const getMyAdsSchema = z.object({
  query: getAdsSchema.shape.query.extend({
    status: z.nativeEnum(AdStatus).optional(),
  }),
});
export type GetMyAdsQuery = z.infer<typeof getMyAdsSchema>['query'];

export const adIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Ad ID is required') }),
});

export type CreateAdInput = z.infer<typeof createAdSchema>['body'];
export type UpdateAdInput = z.infer<typeof updateAdSchema>['body'];
export type GetAdsQuery = z.infer<typeof getAdsSchema>['query'];

// A-05: replaces separate search module — same as getAdsSchema but with required q
export const searchAdsSchema = z.object({
  query: getAdsSchema.shape.query.extend({
    q: z.string().min(1, 'Search query is required').max(200),
  }),
});
export type SearchAdsQuery = z.infer<typeof searchAdsSchema>['query'];
