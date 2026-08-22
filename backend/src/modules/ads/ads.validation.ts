import { z } from 'zod';
import { AdStatus, AdCondition } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

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
    // TRACK-NEARBY-SEARCH: optional precise pin, same bounds as
    // service-providers.validation.ts's own latitude/longitude —
    // multipart form data, so these arrive as strings; z.coerce
    // handles that the same way `price` above does.
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
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
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
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

const adsQueryBaseSchema = z.object({
  page: optionalQueryNumber(z.number().int().min(1).max(1000)),
  limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  city: z.string().max(100).optional(),
  categoryId: z.string().optional(),
  condition: z.nativeEnum(AdCondition).optional(),
  minPrice: optionalQueryNumber(z.number().min(0)),
  maxPrice: optionalQueryNumber(z.number().min(0)),
  search: z.string().min(1).max(200).optional(),
  sortBy: z.enum(AD_SORT_FIELDS).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  // FIX FEAT-06: lets a caller ask for featured ads directly instead of
  // over-fetching a page and filtering client-side (see FeaturedAds.tsx).
  // Query strings arrive as "true"/"false" strings, same shape as
  // isNegotiable above — reuses the same coercion helper.
  isFeatured: z.preprocess(preprocessFormBoolean, z.boolean()).optional(),
});

const adsQuerySchema = adsQueryBaseSchema.refine(
  (q) =>
    q.minPrice === undefined ||
    q.maxPrice === undefined ||
    q.minPrice <= q.maxPrice,
  {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  },
);

export const getAdsSchema = z.object({
  query: adsQuerySchema,
});

export const getMyAdsSchema = z.object({
  query: adsQueryBaseSchema.extend({
    status: z.nativeEnum(AdStatus).optional(),
  }),
});

export type GetMyAdsQuery = z.infer<typeof getMyAdsSchema>['query'];

export const adIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Ad ID is required'),
  }),
});

export type CreateAdInput = z.infer<typeof createAdSchema>['body'];
export type UpdateAdInput = z.infer<typeof updateAdSchema>['body'];
export type GetAdsQuery = z.infer<typeof getAdsSchema>['query'];

// A-05: search handler — same base filters but with required q
export const searchAdsSchema = z.object({
  query: adsQueryBaseSchema.extend({
    q: z.string().min(1, 'Search query is required').max(200),
  }),
});

export type SearchAdsQuery = z.infer<typeof searchAdsSchema>['query'];
