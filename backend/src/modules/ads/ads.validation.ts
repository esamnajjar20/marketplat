import { z } from 'zod';
import { AdStatus, AdCondition } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

/**
 * FIX INTEG-05: createAd sends multipart/form-data (required for image
 * files), so multer puts isNegotiable into req.body as the string
 * "true"/"false" — plain z.boolean() rejected that outright with a 400.
 * z.coerce.boolean() is not a safe substitute: any non-empty string
 * (including "false") coerces to true under JS semantics. This
 * preprocessor matches the exact strings explicitly and passes real
 * booleans/undefined through unchanged, so it's also safe on PATCH
 * /ads/:id's plain-JSON body (updateAd doesn't use FormData, so it
 * never hit this bug, but shares the same schema regardless).
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
  // FIX FAV-02: no `images` field below, and this object isn't
  // .passthrough()'d, so Zod strips any `images` key a client sends
  // before it reaches adsRepository.update — a PATCH body can never
  // overwrite the images array this way. Images only mutate through
  // the dedicated addImages/removeImage endpoints. Recorded here so a
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

// L-3: single source of truth for which columns sortBy may select,
// exported so ads.repository.ts builds its raw-SQL column map (see
// AD_SORT_COLUMN_SQL there) FROM this list instead of hand-copying it.
// The ORM path picks up a new value automatically; the raw-SQL branch
// needs an explicit case or it silently falls back to createdAt — the
// same class of bug FIX H-1 below already fixed once for 'views'.
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
    // FIX AUDIT-V3-08: .min(1) makes "absent" (undefined) the only way
    // to mean "no search filter" — without it, an explicit "" relied on
    // ads.repository.ts's `if (search)` truthiness check rather than
    // validation making that decision explicitly.
    search: z.string().min(1).max(200).optional(),
    // FIX H-1: 'views' added — the frontend's "Most Viewed" sort option
    // always sent sortBy=views, but this enum only accepted
    // createdAt/price, so that selection failed validation with a 400.
    sortBy: z.enum(AD_SORT_FIELDS).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

// FIX D-24 / I-08: GET /ads/me's status filter tabs sent a `status`
// value that getAdsSchema (shared with the public /ads endpoint) had
// no field for, so Zod silently stripped it — findManyByUserId only
// ever applied a hardcoded 'ACTIVE' filter. Kept as its own schema
// (not reused on the public endpoint) because it accepts all three
// AdStatus values including DELETED — safe here since userId is fixed
// server-side to the authenticated caller, unlike the public endpoint
// where an unscoped DELETED filter would leak other users' data.
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
