import { z } from 'zod';
import { FavoriteEntityType } from '@prisma/client';

export const favoriteAdSchema = z.object({
  params: z.object({ adId: z.string().min(1, 'Ad ID is required') }),
});

// FEAT-FAVORITE-POLYMORPHIC PR2: generic multi-entity routes, added
// alongside (not replacing) the AD-only /favorites/:adId routes above
// — those stay exactly as they are, per the PR1 compatibility-layer
// commitment. URL segment is a REST-friendly plural ("products",
// "stores", "services", "ads") rather than the raw Prisma enum name,
// mapped here to the actual FavoriteEntityType the rest of the module
// uses. "ads" is included for symmetry with the other three (so
// POST /favorites/ads/:adId works the same way POST
// /favorites/products/:productId does) even though it's redundant
// with the existing /favorites/:adId route — both reach the same
// favoritesService.toggleFavorite('AD', ...) path underneath, so
// there's no divergent behavior to keep in sync, just two valid URLs
// for the same action.
const ENTITY_TYPE_PARAM_MAP: Record<string, FavoriteEntityType> = {
  ads: FavoriteEntityType.AD,
  products: FavoriteEntityType.PRODUCT,
  stores: FavoriteEntityType.STORE,
  services: FavoriteEntityType.SERVICE_LISTING,
};

const entityTypeParam = z
  .string()
  .refine((val) => val in ENTITY_TYPE_PARAM_MAP, {
    message: 'Unsupported favorite entity type. Use: ads, products, stores, or services.',
  })
  .transform((val) => ENTITY_TYPE_PARAM_MAP[val]);

export const favoriteEntitySchema = z.object({
  params: z.object({
    entityType: entityTypeParam,
    entityId: z.string().min(1, 'Entity ID is required'),
  }),
});

export type FavoriteEntityParams = z.infer<typeof favoriteEntitySchema>['params'];

export const getFavoritesSchema = z.object({
  query: z.object({
    // FIX BUG-FAV-01: .optional() previously sat on the *string* schema,
    // before .transform(Number) — so when the query param was absent
    // (the common case: GET /favorites with no page, or GET /favorites
    // with only limit set), Zod still ran .transform(Number) on the
    // `undefined` that passed through .optional(), producing NaN
    // instead of undefined. NaN then failed the piped z.number() check
    // (Zod's z.number() rejects NaN), so *any* request omitting page or
    // limit was rejected with a 400 — even though both fields are
    // meant to be optional. Moving .optional() to the very end (after
    // the pipe) means "absent" short-circuits before transform/pipe
    // ever run, matching the intended "these params are optional" design.
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(1000))
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    // FEAT-FAVORITE-POLYMORPHIC PR2: optional filter. Omitted entirely
    // (the pre-PR2 default) keeps GET /favorites returning AD favorites
    // only, in the exact legacy { adId, ad } wire shape — see
    // favorites.service.ts's toWireRecord. Passing type=product/store/
    // service switches to the new generic { entityType, entityId,
    // entity } wire shape for that type. There's no "all types mixed
    // together" option: the two wire shapes are different, and a
    // frontend list rendering ads can't render stores without knowing
    // to switch shape anyway — an explicit type param keeps that
    // switch explicit instead of the response shape depending on
    // what the data happens to contain.
    type: z.enum(['ad', 'product', 'store', 'service']).optional(),
    // تصفية حسب قائمة المفضلة المسمّاة (?list=…)
    listId: z.string().min(1).optional(),
  }),
});

export type GetFavoritesQuery = z.infer<typeof getFavoritesSchema>['query'];

// FEAT-FAVORITE-POLYMORPHIC PR2: maps the ?type= query value to the
// Prisma enum, same mapping ENTITY_TYPE_PARAM_MAP does for the URL
// param (kept separate since the query value is singular/lowercase —
// "product" — while the URL segment is plural — "products" — to read
// naturally in each position; both funnel into the same enum).
export const FAVORITE_QUERY_TYPE_MAP: Record<
  NonNullable<GetFavoritesQuery['type']>,
  FavoriteEntityType
> = {
  ad: FavoriteEntityType.AD,
  product: FavoriteEntityType.PRODUCT,
  store: FavoriteEntityType.STORE,
  service: FavoriteEntityType.SERVICE_LISTING,
};
