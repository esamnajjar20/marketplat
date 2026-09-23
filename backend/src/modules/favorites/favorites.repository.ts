import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { Prisma, FavoriteEntityType } from '@prisma/client';
import { GetFavoritesQuery, FAVORITE_QUERY_TYPE_MAP } from './favorites.validation';
import { ProductWithStore, productWithRelations } from '../products/products.repository';
import { StoreWithSeller, storeWithSeller } from '../stores/stores.repository';
import {
  ServiceListingWithProvider,
  listingWithRelations,
} from '../service-listings/service-listings.repository';

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
  | FavoriteAdEntity
  | ProductWithStore
  | StoreWithSeller
  | ServiceListingWithProvider;

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
// Two functions per type on purpose, not one: activeIds is a
// lightweight { id: true }-only query used by counting (matches the
// pre-PR1 countByUserId's own id-only query, which ads.service.ts's
// getMyStats dashboard stat calls on every dashboard load — that call
// site is untouched by PR2 and shouldn't get slower). fetchActive
// pulls the full card shape and is only used by the list endpoint.
type EntityConfig<T> = {
  activeIds: (ids: string[]) => Promise<string[]>;
  fetchActive: (ids: string[]) => Promise<T[]>;
  getId: (entity: T) => string;
};

const AD_CONFIG: EntityConfig<FavoriteAdEntity> = {
  activeIds: async (ids) =>
    (
      await prisma.ad.findMany({
        where: { id: { in: ids }, status: { not: 'DELETED' } },
        select: { id: true },
      })
    ).map((a) => a.id),
  fetchActive: (ids) =>
    prisma.ad.findMany({ where: { id: { in: ids }, status: { not: 'DELETED' } }, select: adSelect }),
  getId: (e) => e.id,
};

const PRODUCT_CONFIG: EntityConfig<ProductWithStore> = {
  activeIds: async (ids) =>
    (
      await prisma.product.findMany({
        where: { id: { in: ids }, status: { not: 'DELETED' } },
        select: { id: true },
      })
    ).map((p) => p.id),
  fetchActive: (ids) =>
    prisma.product.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      include: productWithRelations,
    }),
  getId: (e) => e.id,
};

const STORE_CONFIG: EntityConfig<StoreWithSeller> = {
  activeIds: async (ids) =>
    (
      await prisma.storeDetails.findMany({
        where: { id: { in: ids }, status: { not: 'BLOCKED' } },
        select: { id: true },
      })
    ).map((s) => s.id),
  fetchActive: (ids) =>
    prisma.storeDetails.findMany({
      where: { id: { in: ids }, status: { not: 'BLOCKED' } },
      include: storeWithSeller,
    }),
  getId: (e) => e.id,
};

const SERVICE_LISTING_CONFIG: EntityConfig<ServiceListingWithProvider> = {
  activeIds: async (ids) =>
    (
      await prisma.serviceListing.findMany({
        where: { id: { in: ids }, status: { not: 'DELETED' } },
        select: { id: true },
      })
    ).map((s) => s.id),
  fetchActive: (ids) =>
    prisma.serviceListing.findMany({
      where: { id: { in: ids }, status: { not: 'DELETED' } },
      include: listingWithRelations,
    }),
  getId: (e) => e.id,
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

  delete: async (userId: string, entityType: FavoriteEntityType, entityId: string): Promise<void> => {
    await prisma.favorite.delete({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
    });
  },

  // FIX FAV-01, preserved from the pre-PR1 version: excludes ads whose
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
  countByUserIdAndType: async (userId: string, entityType: FavoriteEntityType): Promise<number> => {
    const rows = await prisma.favorite.findMany({
      where: { userId, entityType },
      select: { entityId: true },
    });
    if (rows.length === 0) return 0;
    const activeIds = await ENTITY_CONFIG[entityType].activeIds(rows.map((r) => r.entityId));
    return activeIds.length;
  },

  findManyByUserId: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<{ favorites: FavoriteListRow[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);

    // FEAT-FAVORITE-POLYMORPHIC PR2: `type` narrows to exactly one
    // FavoriteEntityType (AD by default).
    const type: FavoriteEntityType = query.type ? FAVORITE_QUERY_TYPE_MAP[query.type] : 'AD';
    const config = ENTITY_CONFIG[type];

    // FIX FAV-TOTAL-CONSISTENT + FAV-PAGINATION-SHORT-PAGE: replaces
    // the KNOWN LIMITATION block that shipped with the polymorphic
    // migration. Three problems bundled here.
    //
    // (1) `total` was computed two different ways depending on
    //     ?listId — the listId branch counted every matching row
    //     including ones whose entity is now deleted/blocked; the
    //     non-listId branch used countByUserIdAndType which already
    //     excluded them. Same page could report two different totals.
    //
    // (2) skip/take ran over ALL of the user's favorites of this type
    //     (deleted/blocked entities included), then the active filter
    //     ran after — so a page could come back with fewer than
    //     `limit` items even when more active favorites existed on
    //     the next page. The pre-PR1 code applied the DELETED filter
    //     inside the Prisma where clause, so this was a regression.
    //
    // (3) The naive fix (extra count + activeIds + fetchActive) was
    //     three to five sequential round-trips depending on how the
    //     where clause was constructed.
    //
    // Approach: fetch every matching favorite's {id, entityId} in one
    // ordered query, resolve active entityIds in a single follow-up,
    // then slice/limit over that active-only ordered list. `total` is
    // the active list's length, `skip + take` slices it, and the full
    // entity rows are only fetched for the current page's ids (in
    // parallel). Cost is a fixed 3 queries per call regardless of page
    // number — same order of magnitude as before, with the
    // correctness bugs gone. A page is never short.
    const listFilter = query.listId ? { listId: query.listId } : {};
    const where = { userId, entityType: type, ...listFilter };

    const allOrderedRows = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, entityId: true },
    });
    if (allOrderedRows.length === 0) {
      return { favorites: [], total: 0 };
    }

    const activeIdsSet = new Set(
      await config.activeIds(allOrderedRows.map((r) => r.entityId))
    );
    const activeOrderedRows = allOrderedRows.filter((r) => activeIdsSet.has(r.entityId));
    const total = activeOrderedRows.length;

    const pageRows = activeOrderedRows.slice(skip, skip + take);
    if (pageRows.length === 0) {
      return { favorites: [], total };
    }

    const pageFavoriteIds = pageRows.map((r) => r.id);
    const [favoriteRows, entities] = await Promise.all([
      prisma.favorite.findMany({ where: { id: { in: pageFavoriteIds } } }),
      config.fetchActive(pageRows.map((r) => r.entityId)),
    ]);

    const favoritesById = new Map(favoriteRows.map((f) => [f.id, f]));
    const entitiesById = new Map(entities.map((e) => [config.getId(e), e]));

    // Preserve pageRows' ordering — favoriteRows / entities come back
    // unordered from Prisma's `in` filter.
    const favorites: FavoriteListRow[] = pageRows
      .map((row) => {
        const f = favoritesById.get(row.id);
        if (!f) return null;
        const entity = entitiesById.get(row.entityId) ?? null;
        if (!entity) return null; // activeIds said yes, but fetchActive raced it — treat as inactive
        return {
          id: f.id,
          userId: f.userId,
          entityType: f.entityType,
          entityId: f.entityId,
          listId: f.listId ?? null,
          createdAt: f.createdAt,
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
    return favorites.map((f) => f.userId);
  },
};
