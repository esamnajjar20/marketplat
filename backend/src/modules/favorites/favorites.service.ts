import { favoritesRepository, FavoriteListRow, FavoriteAdEntity, FavoriteEntity } from './favorites.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { productsService } from '../products/products.service';
import { storesService } from '../stores/stores.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { activityService, activityTemplates } from '../activity';
import { GetFavoritesQuery, FAVORITE_QUERY_TYPE_MAP } from './favorites.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { ActivityEntityType, FavoriteEntityType } from '@prisma/client';
import { isPrismaError } from '../../shared/utils/prismaErrors';

// FEAT-FAVORITE-POLYMORPHIC PR1: the WIRE response of GET /favorites
// (no ?type= param) is one of the 3 endpoints the compat-layer plan
// commits to leaving byte-for-byte unchanged. favoritesRepository
// returns the generic { entityType, entityId, entity } shape — but
// the frontend (favorites.api.ts's FavoriteRecord, FavoritesList.tsx,
// useFavorites.ts's useEffect reading `fav.ad.id`) still expects the
// pre-PR1 { id, userId, adId, createdAt, ad } shape. This mapping is
// that seam: internal naming is generic, the default AD-scoped wire
// response stays exactly what it was before this migration.
export interface FavoriteWireRecord {
  id: string;
  userId: string;
  adId: string;
  listId: string | null;
  createdAt: Date;
  ad: FavoriteAdEntity;
}

const toWireRecord = (row: FavoriteListRow): FavoriteWireRecord | null => {
  if (row.entityType !== 'AD' || !row.entity) return null;
  return {
    id: row.id,
    userId: row.userId,
    adId: row.entityId,
    listId: row.listId ?? null,
    createdAt: row.createdAt,
    ad: row.entity as FavoriteAdEntity,
  };
};

// FEAT-FAVORITE-POLYMORPHIC PR2: the generic shape used by GET
// /favorites?type=product|store|service — no legacy precedent to
// preserve here (these entity types were never favoritable before
// PR2), so this is just FavoriteListRow with a guaranteed non-null
// `entity` (rows with no resolved entity are already dropped by the
// repository's own filter).
export interface FavoriteEntityWireRecord {
  id: string;
  userId: string;
  entityType: FavoriteEntityType;
  entityId: string;
  listId: string | null;
  createdAt: Date;
  entity: FavoriteEntity;
}

const toGenericWireRecord = (row: FavoriteListRow): FavoriteEntityWireRecord | null => {
  if (!row.entity) return null;
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    listId: row.listId ?? null,
    createdAt: row.createdAt,
    entity: row.entity,
  };
};

// FEAT-FAVORITE-POLYMORPHIC PR2: FavoriteEntityType and
// ActivityEntityType have the same 4 member names (AD/PRODUCT/
// SERVICE_LISTING/STORE) but are two distinct Prisma enums (Favorite
// didn't exist as a favoritable-by-type concept before PR1, so it
// needed its own enum rather than reusing UserActivity's). This map
// is the one place that says "these mean the same real-world entity
// kind" — activityTemplates.favoriteAdded/Removed take an
// ActivityEntityType (they're shared with every other module that
// records activity, not favorites-specific), so a Favorite toggle has
// to translate through this before calling them.
const TO_ACTIVITY_ENTITY_TYPE: Record<FavoriteEntityType, ActivityEntityType> = {
  AD: ActivityEntityType.AD,
  PRODUCT: ActivityEntityType.PRODUCT,
  STORE: ActivityEntityType.STORE,
  SERVICE_LISTING: ActivityEntityType.SERVICE_LISTING,
};

// FEAT-FAVORITE-POLYMORPHIC PR2: resolves + validates a favorite
// target exists (via each module's own xForReference facade — same
// pattern reports.service.ts already uses for the same reason: don't
// reach into another module's repository directly) and returns its
// display title, so the create/delete/activity-record core below
// (performToggle) can stay entity-agnostic. AD is included here too
// (not just PRODUCT/STORE/SERVICE_LISTING) so toggleFavorite and
// toggleFavoriteEntity can share one implementation instead of two
// near-identical ones.
const resolveEntity = async (
  entityType: FavoriteEntityType,
  entityId: string
): Promise<{ title: string } | null> => {
  switch (entityType) {
    case 'AD': {
      const ad = await adsService.findAdForReference(entityId);
      return ad ? { title: ad.title } : null;
    }
    case 'PRODUCT': {
      const product = await productsService.findProductForReference(entityId);
      return product ? { title: product.name } : null;
    }
    case 'STORE': {
      const store = await storesService.findStoreForReference(entityId);
      return store ? { title: store.name } : null;
    }
    case 'SERVICE_LISTING': {
      const listing = await serviceListingsService.findServiceListingForReference(entityId);
      return listing ? { title: listing.title } : null;
    }
  }
};

const NOT_FOUND_BY_TYPE: Record<FavoriteEntityType, { message: string; code: string }> = {
  AD: { message: 'Ad not found', code: 'AD_NOT_FOUND' },
  PRODUCT: { message: 'Product not found', code: 'PRODUCT_NOT_FOUND' },
  STORE: { message: 'Store not found', code: 'STORE_NOT_FOUND' },
  SERVICE_LISTING: { message: 'Service listing not found', code: 'SERVICE_LISTING_NOT_FOUND' },
};

// Shared core for toggleFavorite (AD, via the legacy /favorites/:adId
// route) and toggleFavoriteEntity (PR2's generic route) — same
// create/delete/concurrency-race handling either way, only the
// reference validation and activity-template entity type differ.
const performToggle = async (
  userId: string,
  entityType: FavoriteEntityType,
  entityId: string
): Promise<{ action: 'added' | 'removed' }> => {
  const entity = await resolveEntity(entityType, entityId);
  if (!entity) {
    const { message, code } = NOT_FOUND_BY_TYPE[entityType];
    throw new NotFoundError(message, code);
  }
  const activityEntityType = TO_ACTIVITY_ENTITY_TYPE[entityType];

  const existing = await favoritesRepository.findByUserAndEntity(userId, entityType, entityId);
  if (existing) {
    try {
      await favoritesRepository.delete(userId, entityType, entityId);
    } catch (err) {
      // CONCURRENCY-FIX: another concurrent toggle already deleted this
      // favorite (P2025 = record not found). Treat as a successful no-op
      // rather than surfacing a 500 for a benign race.
      if (!isPrismaError(err, 'P2025')) throw err;
    }
    // Gap #10: fire-and-forget, see activityService.record()'s own
    // doc comment.
    activityService.record({
      userId,
      ...activityTemplates.favoriteRemoved(activityEntityType, entityId, entity.title),
    });
    return { action: 'removed' };
  }

  try {
    await favoritesRepository.create(userId, entityType, entityId);
  } catch (err) {
    // CONCURRENCY-FIX: another concurrent toggle already created this
    // favorite (P2002 = unique constraint violation, on
    // userId_entityType_entityId). Treat as a successful no-op instead
    // of a 500.
    if (!isPrismaError(err, 'P2002')) throw err;
  }
  activityService.record({
    userId,
    ...activityTemplates.favoriteAdded(activityEntityType, entityId, entity.title),
  });
  return { action: 'added' };
};

export const favoritesService = {
  // Legacy AD-only entry point — /favorites/:adId routes, unchanged
  // behavior/signature from PR1, now implemented via the shared
  // performToggle core.
  toggleFavorite: async (userId: string, adId: string): Promise<{ action: 'added' | 'removed' }> =>
    performToggle(userId, 'AD', adId),

  // FEAT-FAVORITE-POLYMORPHIC PR2: generic entry point for the new
  // /favorites/:entityType/:entityId routes (products/stores/services
  // — see favorites.validation.ts's URL param mapping; AD isn't
  // reachable through this path, only through the legacy route above).
  toggleFavoriteEntity: async (
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string
  ): Promise<{ action: 'added' | 'removed' }> => performToggle(userId, entityType, entityId),

  getMyFavorites: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<PaginatedResult<FavoriteWireRecord | FavoriteEntityWireRecord>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { favorites, total } = await favoritesRepository.findManyByUserId(userId, query);

    // No ?type= param: legacy AD-only path, exact pre-PR1 wire shape.
    // ?type= given: PR2's generic wire shape for that single type. See
    // favorites.validation.ts's getFavoritesSchema comment for why
    // there's no combined/mixed-type response.
    const items = query.type
      ? favorites.map(toGenericWireRecord).filter((r): r is FavoriteEntityWireRecord => r !== null)
      : favorites.map(toWireRecord).filter((r): r is FavoriteWireRecord => r !== null);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  // UX-FIX (frontend audit P2-03): AdDetailSection.tsx previously called
  // GET /favorites?limit=100 (the endpoint's max page size) on every ad
  // detail view just to derive one boolean — whether *this* ad is
  // favorited — and was silently wrong for any user with >100
  // favorites, since the ad in question could sit past the cap. Reuses
  // the same findByUserAndEntity() the toggle endpoint already calls
  // internally — no new query, just a new thin route onto existing,
  // exercised repository code.
  isFavorited: async (userId: string, adId: string): Promise<boolean> => {
    const favorite = await favoritesRepository.findByUserAndEntity(userId, 'AD', adId);
    return favorite !== null;
  },

  // FEAT-FAVORITE-POLYMORPHIC PR2: generic equivalent of isFavorited,
  // for the same "is this specific card already favorited" check on a
  // product/store/service-listing detail page.
  isFavoritedEntity: async (
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string
  ): Promise<boolean> => {
    const favorite = await favoritesRepository.findByUserAndEntity(userId, entityType, entityId);
    return favorite !== null;
  },
};
