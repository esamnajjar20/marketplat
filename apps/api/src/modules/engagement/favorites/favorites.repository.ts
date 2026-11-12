import { prisma } from '../../../config/prisma';
import { getPaginationParams } from '../../../shared/http/pagination';
import { Prisma, FavoriteEntityType } from '@prisma/client';
import { GetFavoritesQuery, FAVORITE_QUERY_TYPE_MAP } from './favorites.validation';
import {
  ProductWithStore,
  productWithRelations,
  productWithRelationsLite,
  ProductWithStoreLite,
} from '../../commerce/products/products.repository';
import { StoreWithSeller, storeWithSeller } from '../../commerce/stores/stores.repository';
import {
  ServiceListingWithProvider,
  listingWithRelations,
} from '../../services/service-listings/service-listings.repository';

// FEAT-FAVORITE-POLYMORPHIC PR1: Favorite no longer has a Prisma
// relation to Ad (or to anything) — same reasoning as UserActivity's
// entityId: a favorited entity must keep its Favorite row intact even
// if the entity itself is later hard-deleted, and Prisma has no
// cross-model polymorphic relation type.
//
// FEAT-FAVORITE-POLYMORPHIC PR2: findManyByUserId's `type` filter
// (see favorites.validation.ts) always narrows to exactly one
// FavoriteEntityType per call — there's no "all types mixed together"
// mode (see that file's comment for why). That means the fan-out
// below is genuinely a single follow-up query per call, not a
// multi-branch join: fetch this page's Favorite rows for the target
// type, then one query against that type's own table for the active
// ones. ENTITY_CONFIG is what makes that one code path work for all
// four types instead of writing the same fetch/filter/map logic 4
// times.

const adSelect = {
  id: true,
  title: true,
  price: true,
  images: true,
  city: true,
  latitude: true,
  longitude: true,
  condition: true,
  isNegotiable: true,
  status: true,
  views: true,
  viewsAtLastReport: true,
  isFeatured: true,
  isPinned: true,
  riskScore: true,
  flaggedForReview: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  categoryId: true,
  sellerProfileId: true,
  // keep in sync with adListSelect scalars
  offlineOperationId: true,
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;

export type FavoriteAdEntity = Prisma.AdGetPayload<{ select: typeof adSelect }>;

// The union of everything a Favorite can point at. AD keeps its own
// hand-picked select (unchanged from PR1 — dropping fields off Ad
// here is a deliberate, audited list, not "whatever Prisma returns").
// PRODUCT/STORE/SERVICE_LISTING reuse each module's own cross-module
// include shape (ProductWithStore/StoreWithSeller/
// ServiceListingWithProvider) rather than a second, favorites-specific
// select, so a favorited product's card always matches what every
// other cross-module read of a product already returns.
export type FavoriteEntity =
  FavoriteAdEntity | ProductWithStore | StoreWithSeller | ServiceListingWithProvider;

export type FavoriteListRow = {
  id: string;
  userId: string;
  entityType: FavoriteEntityType;
  entityId: string;
  listId: string | null;
  createdAt: Date;
  entity: FavoriteEntity | null; // null if the referenced entity was hard-deleted (or, for STORE, BLOCKED) after favoriting
};

// FEAT-FAVORITE-POLYMORPHIC PR2: what "still active/visible" means
// differs per entity type — Ad/Product/ServiceListing all soft-delete
// via status: 'DELETED' (a SOLD ad, or a PAUSED product/listing, is
// still shown — same as the pre-PR1 behavior for ads), while
// StoreDetails has no DELETED state at all, only BLOCKED (see
// StoreStatus's own enum — PENDING/ACTIVE/BLOCKED), so a BLOCKED
// store is the equivalent "don't show this anymore" state for stores.
//
// fetchActive pulls the full card shape for one page of the list endpoint.
// Counting and pagination do NOT go through it: they run in SQL via
// activeFavoritesFilter/ACTIVE_COUNT_TARGETS below, which must apply the same
// "not DELETED / not BLOCKED" rule as each fetchActive.
type EntityConfig<T> = {
  fetchActive: (ids: string[]) => Promise<T[]>;
  getId: (entity: T) => string;
};

const AD_CONFIG: EntityConfig<FavoriteAdEntity> = {
  fetchActive: ids =>
    prisma.ad.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      select: adSelect,
    }),
  getId: e => e.id,
};

const PRODUCT_CONFIG: EntityConfig<ProductWithStoreLite> = {
  fetchActive: ids =>
    prisma.product.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      // the favourites list renders ProductCard,
      // which never reads store.storeType.fields. Use the lite variant.
      include: productWithRelationsLite,
    }),
  getId: e => e.id,
};

const STORE_CONFIG: EntityConfig<StoreWithSeller> = {
  fetchActive: ids =>
    prisma.storeDetails.findMany({
      where: { id: { in: ids }, status: { not: 'BLOCKED' } },
      include: storeWithSeller,
    }),
  getId: e => e.id,
};

const SERVICE_LISTING_CONFIG: EntityConfig<ServiceListingWithProvider> = {
  fetchActive: ids =>
    prisma.serviceListing.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      include: listingWithRelations,
    }),
  getId: e => e.id,
};

// Closed whitelist used by countByUserIdAndType's raw join. Keep in sync with
// the `status: { not: ... }` filter of the matching *_CONFIG.fetchActive above.
const ACTIVE_COUNT_TARGETS: Record<FavoriteEntityType, { table: string; excludedStatus: string }> = {
  AD: { table: '"ads"', excludedStatus: 'DELETED' },
  PRODUCT: { table: '"products"', excludedStatus: 'DELETED' },
  STORE: { table: '"store_details"', excludedStatus: 'BLOCKED' },
  SERVICE_LISTING: { table: '"service_listings"', excludedStatus: 'DELETED' },
};

/**
 * `FROM favorites f JOIN <entity table> t WHERE ...` for one user + type,
 * keeping only favorites whose entity is still "active". Favorite.entityId is
 * polymorphic (no FK), so it is joined by hand. The unique index
 * (userId, entityType, entityId) guarantees one row per entity, so COUNT(*)
 * equals the number of distinct active entities. Table names come only from
 * ACTIVE_COUNT_TARGETS, never from input; every value is a bound parameter.
 */
const activeFavoritesFilter = (
  userId: string,
  entityType: FavoriteEntityType,
  listId?: string
): Prisma.Sql => {
  const target = ACTIVE_COUNT_TARGETS[entityType];
  return Prisma.sql`
    FROM "favorites" f
    JOIN ${Prisma.raw(target.table)} t ON t."id" = f."entityId"
    WHERE f."userId" = ${userId}
      AND f."entityType" = ${entityType}::"FavoriteEntityType"
      AND t."status"::text <> ${target.excludedStatus}
      ${listId ? Prisma.sql`AND f."listId" = ${listId}` : Prisma.empty}`;
};

// NOTE: EntityConfig<T>'s getId is contravariant in T (a function
// parameter position), so a Record<FavoriteEntityType,
// EntityConfig<FavoriteEntity>> can't be built by assigning each
// concrete EntityConfig<FavoriteAdEntity>/EntityConfig<ProductWithStore>/
// etc. into it — TypeScript correctly rejects that as unsound. Typed
// as `any` here specifically (not a wider escape hatch elsewhere in
// this file) since the four concrete configs above are already fully
// typed and audited; this map only erases that per-branch type at the
// point where they're stored together, and every call site below
// immediately narrows back to a real type via FavoriteEntity | null.
type FavoritePageRow = {
  id: string;
  userId: string;
  entityType: FavoriteEntityType;
  entityId: string;
  listId: string | null;
  createdAt: Date;
  total: number;
};

const ENTITY_CONFIG: Record<FavoriteEntityType, EntityConfig<any>> = {
  AD: AD_CONFIG,
  PRODUCT: PRODUCT_CONFIG,
  STORE: STORE_CONFIG,
  SERVICE_LISTING: SERVICE_LISTING_CONFIG,
};

export const favoritesRepository = {
  findByUserAndEntity: async (userId: string, entityType: FavoriteEntityType, entityId: string) =>
    prisma.favorite.findUnique({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
    }),

  create: async (userId: string, entityType: FavoriteEntityType, entityId: string) =>
    prisma.favorite.create({ data: { userId, entityType, entityId } }),

  delete: async (
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string
  ): Promise<void> => {
    await prisma.favorite.delete({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
    });
  },

  // , preserved from the pre-PR1 version: excludes ads whose
  // status is DELETED so a dead ad doesn't sit in "المفضلة" forever.
  // AD-only and left as its own named method (not folded into
  // countByUserIdAndType's generic signature) because ads.service.ts's
  // getMyStats calls this exact method, by this exact name, for the
  // "My Dashboard" favoritesCount stat — same reasoning as
  // findUserIdsByAdId being kept AD-specific: renaming/generalizing it
  // buys PR2 nothing and adds unrelated-file churn to ads.service.ts.
  countByUserId: async (userId: string): Promise<number> =>
    favoritesRepository.countByUserIdAndType(userId, 'AD'),

  // FEAT-FAVORITE-POLYMORPHIC PR2: generic version, used by
  // findManyByUserId below for whichever type it was called with.
  // PERF: one COUNT join instead of loading every favorite row and then an
  // `id IN (...)` lookup (see activeFavoritesFilter for the join rules).
  countByUserIdAndType: async (userId: string, entityType: FavoriteEntityType): Promise<number> => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      ${activeFavoritesFilter(userId, entityType)}
    `);
    return rows[0]?.count ?? 0;
  },

  findManyByUserId: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<{ favorites: FavoriteListRow[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);

    // `type` narrows to exactly one FavoriteEntityType (AD by default).
    const type: FavoriteEntityType = query.type ? FAVORITE_QUERY_TYPE_MAP[query.type] : 'AD';
    const config = ENTITY_CONFIG[type];
    const filter = activeFavoritesFilter(userId, type, query.listId);

    // PERF: the active-only filter, ordering, pagination and total are all done
    // in ONE SQL query (join on the entity table + COUNT(*) OVER()), so memory
    // and DB work are O(page) instead of O(all of the user's favorites).
    // Because soft-deleted/blocked entities are excluded *before* LIMIT/OFFSET,
    // a page is never short and `total` always counts active favorites only
    // (same guarantees as the previous in-memory slicing: FAV-PAGINATION-SHORT-PAGE).
    // `id DESC` is a tie-breaker so equal createdAt values paginate stably.
    const pageRows = await prisma.$queryRaw<Array<FavoritePageRow>>(Prisma.sql`
      SELECT f."id", f."userId", f."entityType", f."entityId", f."listId", f."createdAt",
             COUNT(*) OVER()::int AS "total"
      ${filter}
      ORDER BY f."createdAt" DESC, f."id" DESC
      LIMIT ${take} OFFSET ${skip}
    `);

    if (pageRows.length === 0) {
      // Window total is unavailable when the requested page is past the end;
      // only then pay for a separate COUNT so `total` stays accurate.
      if (skip === 0) return { favorites: [], total: 0 };
      const [{ count } = { count: 0 }] = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        ${filter}
      `);
      return { favorites: [], total: count };
    }

    const total = pageRows[0].total;
    const entities = await config.fetchActive(pageRows.map(r => r.entityId));
    const entitiesById = new Map(entities.map(e => [config.getId(e), e]));

    // Entities come back unordered from Prisma's `in` filter — keep SQL order.
    const favorites: FavoriteListRow[] = pageRows
      .map(row => {
        const entity = entitiesById.get(row.entityId) ?? null;
        if (!entity) return null; // active in the join, but fetchActive raced it — treat as inactive
        return {
          id: row.id,
          userId: row.userId,
          entityType: row.entityType,
          entityId: row.entityId,
          listId: row.listId ?? null,
          createdAt: row.createdAt,
          entity,
        };
      })
      .filter((r): r is FavoriteListRow => r !== null);

    return { favorites, total };
  },

  /** Epic 6: every user who favorited this ad — used only to fan out
   * FAV_AD_PRICE_CHANGED/FAV_AD_SOLD notifications on ad updates
   * (ads.service.ts's updateAd). Name kept as findUserIdsByAdId (not
   * findUserIdsByEntity) since both call sites are AD-specific and
   * this is the compatibility-layer boundary those call sites depend
   * on — renaming it buys nothing PR1/PR2 need and just adds churn to
   * ads.service.ts. */
  findUserIdsByAdId: async (adId: string): Promise<string[]> => {
    const favorites = await prisma.favorite.findMany({
      where: { entityType: 'AD', entityId: adId },
      select: { userId: true },
    });
    return favorites.map(f => f.userId);
  },
};
