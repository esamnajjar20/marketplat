/**
 * Polymorphic favorite types — PR3 (frontend Favorites).
 *
 * Ads keep their own dedicated shape (api/favorites.api.ts's
 * FavoriteRecord) for backward compatibility — GET /favorites with no
 * ?type= param still returns that exact pre-PR1 { adId, ad } shape,
 * and every existing AD consumer (FavoritesList.tsx, AdCard.tsx,
 * useFavorites.ts) keeps reading it unchanged.
 *
 * This file covers the three entity kinds PR2 added on the backend
 * (favorites.validation.ts's ENTITY_TYPE_PARAM_MAP / FAVORITE_QUERY_TYPE_MAP):
 * PRODUCT, STORE, SERVICE_LISTING. AD is reachable through the new
 * generic /favorites/:entityType/:entityId routes too (as 'ads'), but
 * the frontend has no reason to use that path for ads when the legacy
 * /favorites/:adId routes already work — so FavoriteEntityKind
 * deliberately excludes 'AD'.
 */
import type { ProductWithStore } from './product.types';
import type { StoreWithSeller } from './store.types';
import type { ServiceListingWithProvider } from './service.types';

/** The three entity kinds PR3 wires up on the frontend. */
export type FavoriteEntityKind = 'PRODUCT' | 'STORE' | 'SERVICE_LISTING';

/**
 * URL path segment for POST /favorites/:segment/:entityId and
 * GET /favorites/:segment/:entityId/check — matches
 * favorites.validation.ts's ENTITY_TYPE_PARAM_MAP exactly (plural,
 * lowercase).
 */
export const FAVORITE_ROUTE_SEGMENT: Record<FavoriteEntityKind, string> = {
  PRODUCT: 'products',
  STORE: 'stores',
  SERVICE_LISTING: 'services',
};

/**
 * GET /favorites?type= value — matches favorites.validation.ts's
 * getFavoritesSchema `type` enum (singular, lowercase) — a different
 * casing convention from the URL segment above on purpose, see that
 * file's own comment.
 */
export const FAVORITE_QUERY_TYPE: Record<FavoriteEntityKind, 'product' | 'store' | 'service'> = {
  PRODUCT: 'product',
  STORE: 'store',
  SERVICE_LISTING: 'service',
};

/**
 * Wire shape of one item in GET /favorites?type=product|store|service —
 * matches the backend's FavoriteEntityWireRecord (favorites.service.ts)
 * exactly: no `.ad` nesting, entity sits under `.entity` and its own
 * type still travels with it.
 */
export interface FavoriteEntityRecord<T> {
  id: string;
  userId: string;
  entityType: FavoriteEntityKind;
  entityId: string;
  createdAt: string;
  entity: T;
}

export type FavoriteProductRecord = FavoriteEntityRecord<ProductWithStore>;
export type FavoriteStoreRecord = FavoriteEntityRecord<StoreWithSeller>;
export type FavoriteServiceRecord = FavoriteEntityRecord<ServiceListingWithProvider>;
