import { prisma } from '../../config/prisma';
import { StoreDetails, Prisma } from '@prisma/client';
import { uploadStoreLogo, uploadStoreCover, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { storesRepository, StoreWithSeller, StoreWithSellerAndCounts } from './stores.repository';
import { storeFollowersRepository, StoreFollowerWithStore } from './store-followers.repository';
import { storeReviewsRepository, StoreReviewWithRater } from './store-reviews.repository';
import { promotionsRepository } from '../promotions/promotions.repository';
import { productsRepository } from '../products/products.repository';
import { generateStoreSlug, withSlugSuffix } from '../../shared/utils/slugify';
import {
  CreateStoreInput,
  UpdateStoreInput,
  GetStoresQuery,
  UpdateStoreStatusInput,
  UpdateStorePlanInput,
  CreateStoreReviewInput,
  GetStoreReviewsQuery,
  AdminGetStoresQuery,
} from './stores.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { sellersRepository } from '../sellers/sellers.repository';
import { blockedUsersService } from '../blocked-users';
import { withStoreCreationLock } from '../../shared/utils/storeLock';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { activityService, activityTemplates } from '../activity';
import { PaginationMeta, buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';

const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// STORE-HOURS: derives a live open/closed flag from workingHours + the
// server's current local time. No per-store timezone column exists
// anywhere in this schema (ServiceProviderDetails doesn't have one
// either) — this assumes the server itself runs in the marketplace's
// local timezone, same implicit assumption every other DateTime-based
// feature here already makes. Returns null (render nothing) rather
// than false when workingHours hasn't been set at all, so "unknown"
// isn't shown to the user as "closed".
const computeIsOpen = (workingHours: Prisma.JsonValue | null): boolean | null => {
  if (!workingHours || typeof workingHours !== 'object') return null;
  const now = new Date();
  const todayKey = WEEKDAY_KEYS[now.getDay()];
  const today = (workingHours as Record<string, { open: string; close: string } | null>)[todayKey];
  if (!today) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hhmm >= today.open && hhmm < today.close;
};

// STORE-SLUG: bounded collision-retry — findBySlug then insert, not a
// unique-constraint catch-and-retry, so the same helper can be reused
// by both createStore (fresh insert) and any future rename flow
// without needing to inspect a Prisma error's target field to tell a
// slug collision apart from the sellerProfileId one-store-per-seller
// constraint. 5 attempts is generous: collisions only happen when two
// stores share an identical name, and each retry adds 4 random chars
// (36^4 ≈ 1.7M combinations).
const generateUniqueSlug = async (name: string): Promise<string> => {
  const base = generateStoreSlug(name);
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await storesRepository.findBySlug(candidate);
    if (!existing) return candidate;
    candidate = withSlugSuffix(base);
  }
  // Last resort: a slug is still required to proceed. Vanishingly
  // unlikely to be reached (see combinations above).
  return withSlugSuffix(base);
};

export type StorePublicView = StoreWithSellerAndCounts & { isOpen: boolean | null };

export interface StoreAnalytics {
  views: number;
  followers: number;
  newFollowers7d: number;
  newFollowers30d: number;
  activeProducts: number;
  activePromotions: number;
  promotionUses: number;
  topProducts: { id: string; name: string; views: number; image: string | null }[];
}

// Same "extension on SellerProfile" entry point service-listings.service.ts's
// requireOwnProvider plays for services — every write in this module goes
// through this first.
const requireOwnStore = async (userId: string): Promise<StoreDetails> => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new BadRequestError('You need a seller profile first.');

  if (sellerProfile.suspended) {
    throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
  }

  const store = await storesRepository.findBySellerProfileId(sellerProfile.id);
  if (!store) {
    throw new BadRequestError('You need to create your store first.');
  }
  return store;
};

export const storesService = {
  // Store is built on top of an existing SellerProfile, never created
  // independently of one — same eligibility gate (email verified,
  // agreed to seller terms) SellerProfile itself already enforces is
  // inherited for free, mirroring createServiceProvider.
  createStore: async (userId: string, input: CreateStoreInput): Promise<StoreDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) {
      throw new BadRequestError('You need a seller profile before opening a store.');
    }
    if (sellerProfile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }

    const existing = await storesRepository.findBySellerProfileId(sellerProfile.id);
    if (existing) {
      throw new ConflictError('You already have a store.', 'STORE_ALREADY_EXISTS');
    }

    const store = await withStoreCreationLock(sellerProfile.id, async () => {
      const stillExisting = await storesRepository.findBySellerProfileId(sellerProfile.id);
      if (stillExisting) {
        throw new ConflictError('You already have a store.', 'STORE_ALREADY_EXISTS');
      }

      const slug = await generateUniqueSlug(input.name);

      try {
        return await prisma.$transaction(async tx =>
          storesRepository.create(tx, sellerProfile.id, {
            name: input.name,
            slug,
            description: input.description,
            city: input.city,
            address: input.address,
            phone: input.phone,
            logoUrl: input.logoUrl,
            coverImageUrl: input.coverImageUrl,
            latitude: input.latitude,
            longitude: input.longitude,
            workingHours: input.workingHours as Prisma.InputJsonValue | undefined,
          })
        );
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new ConflictError('You already have a store.', 'STORE_ALREADY_EXISTS');
        }
        throw error;
      }
    });

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment — runs after the lock has released and the transaction
    // has committed, never awaited inline with either.
    activityService.record({ userId, ...activityTemplates.storeCreated(store.id, store.name) });

    return store;
  },

  getMyStore: async (userId: string): Promise<StoreDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const store = await storesRepository.findBySellerProfileId(sellerProfile.id);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    return store;
  },

  // UNIFY-PAYMENTS-STORES: no paymentMethods handling here anymore —
  // UpdateStoreInput no longer carries that field (see
  // stores.validation.ts), so `input` forwards straight through.
  updateMyStore: async (userId: string, input: UpdateStoreInput): Promise<StoreDetails> => {
    const store = await requireOwnStore(userId);
    const updated = await storesRepository.update(store.id, input);

    // Gap #10: fire-and-forget, see createStore's own comment above.
    activityService.record({ userId, ...activityTemplates.storeUpdated(updated.id, updated.name) });

    return updated;
  },

  // Feature-completeness fix: logoUrl/coverImageUrl were fully
  // supported end-to-end by createStore/updateStore (validated, stored,
  // rendered in StoreHeader/StoreCard/MyStoreCard) but had no upload
  // path anywhere — the only way to set either was a hand-crafted PATCH
  // with an already-hosted URL. Follows usersService.uploadAvatar's
  // exact pattern: upload first, persist the URL, clean up whichever
  // side fails.
  uploadLogo: async (userId: string, file: Express.Multer.File): Promise<StoreDetails> => {
    const store = await requireOwnStore(userId);
    const { url, publicId } = await uploadStoreLogo(file.buffer);

    try {
      const updated = await storesRepository.update(store.id, { logoUrl: url });
      if (store.logoUrl) {
        const oldPublicId = extractCloudinaryPublicId(store.logoUrl);
        if (oldPublicId) await deleteImage(oldPublicId).catch(() => undefined);
      }
      return updated;
    } catch (error) {
      await cleanupUploadedImages([publicId]);
      throw error;
    }
  },

  uploadCover: async (userId: string, file: Express.Multer.File): Promise<StoreDetails> => {
    const store = await requireOwnStore(userId);
    const { url, publicId } = await uploadStoreCover(file.buffer);

    try {
      const updated = await storesRepository.update(store.id, { coverImageUrl: url });
      if (store.coverImageUrl) {
        const oldPublicId = extractCloudinaryPublicId(store.coverImageUrl);
        if (oldPublicId) await deleteImage(oldPublicId).catch(() => undefined);
      }
      return updated;
    } catch (error) {
      await cleanupUploadedImages([publicId]);
      throw error;
    }
  },

  // STORE-SLUG: `idOrSlug` tries the cuid `id` lookup first (cheap PK
  // hit), then falls back to `slug` — so existing bookmarked/shared
  // /stores/:id links never break, while new shares can use the
  // friendlier slug. Same NotFoundError/status gate as before either
  // way.
  getPublicStore: async (idOrSlug: string): Promise<StorePublicView> => {
    const store =
      (await storesRepository.findPublicById(idOrSlug)) ??
      (await storesRepository.findPublicBySlug(idOrSlug));
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    // SEC-FIX: same gap products.service.ts's getProductById already
    // closed for suspended-seller/blocked-store products — findMany's
    // directory query already hardcodes `status: 'ACTIVE'`, but this
    // direct-by-id lookup ignored status entirely, so a PENDING store
    // (not yet approved) or a BLOCKED one stayed fully viewable via its
    // direct URL. Treated as 404, not a partial "hidden from the
    // directory but still live" state — matches toggleFollow/createReview,
    // which already gate on status === 'ACTIVE' for the same store.
    if (store.status !== 'ACTIVE') {
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    }
    // STORE-VIEWS: fire-and-forget, same "don't fail the read on a
    // failed counter bump" convention as products.service.ts's
    // getProductById.
    storesRepository.incrementViews(store.id).catch(() => undefined);
    return { ...store, isOpen: computeIsOpen(store.workingHours) };
  },

  getStores: async (
    query: GetStoresQuery
  ): Promise<{ stores: StoreWithSeller[]; meta: PaginationMeta }> => {
    const { page = 1, limit = 20 } = query;
    const { stores, total } = await storesRepository.findMany(query);
    return { stores, meta: buildPaginationMeta(total, page, limit) };
  },

  // FEAT-REPORT-USER-STORE: facade for cross-module use (reportsService),
  // same pattern as ads.service.ts's findAdForReference — returns the
  // store without side effects, so reportsService can validate a
  // targetId=STORE report points at a real store without importing
  // storesRepository directly. Includes sellerProfile (not just the bare
  // store row) because reportsService needs sellerProfile.userId to
  // resolve "who owns this store" for its self-report check — a store
  // has no userId column of its own, only sellerProfileId.
  findStoreForReference: async (storeId: string): Promise<StoreWithSeller | null> => {
    return storesRepository.findByIdWithSeller(storeId);
  },

  // Admin directory — see audit report issue #1: PENDING stores had no
  // endpoint to even list them for approval, so createStore's required
  // admin approval step was unreachable. Mirrors sellersService.getAllSellers.
  getAllStores: async (
    query: AdminGetStoresQuery
  ): Promise<{ stores: StoreWithSeller[]; meta: PaginationMeta }> => {
    const { page = 1, limit = 20, status, q, featureRequested } = query;
    const skip = (page - 1) * limit;
    const { stores, total } = await storesRepository.findManyForAdmin({
      skip,
      take: limit,
      status,
      q,
      featureRequested: featureRequested === true,
    });
    return { stores, meta: buildPaginationMeta(total, page, limit) };
  },

  // Admin-only: PENDING → ACTIVE (approve) or → BLOCKED. Mirrors
  // sellersService's verify/suspend admin actions.
  updateStoreStatus: async (
    id: string,
    input: UpdateStoreStatusInput,
    adminUserId: string
  ): Promise<StoreDetails> => {
    const store = await storesRepository.findById(id);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    const updated = await storesRepository.updateStatus(id, input.status);

    // AUDIT-FIX (issue #10 follow-up): this admin action wrote no audit
    // trail at all — same gap sellersService.setVerification/setSuspension
    // closed for ADMIN_SELLER_VERIFIED/SUSPENDED. adminUserId is required
    // (FIX SEC-3.2) so a future caller can't silently forget to pass it
    // and lose the audit trail — the type system enforces what used to
    // only be true by convention.
    //
    // AUDIT-FIX 2.2: the `.catch(() => {})` that used to sit on this call
    // was dead code — auditLog() itself never rejects (it logs via
    // logger.info unconditionally first, then attempts the DB write with
    // its own internal .catch() that logs any DB failure via
    // logger.error; see shared/utils/auditLog.ts). It read as if it were
    // the thing protecting against a failed audit write, which was
    // misleading. Removed; if auditLog()'s own contract ever changes to
    // reject, this call site should be revisited deliberately rather
    // than silently swallowing it again.
    void auditLog({
      event: AuditEvent.ADMIN_STORE_STATUS_CHANGED,
      userId: adminUserId,
      details: { storeId: id, status: input.status, ...(input.reason ? { reason: input.reason } : {}) },
    });

    return updated;
  },

  // FIX BUG-02: StorePlan.FEATURED had no code path that ever set it —
  // no admin endpoint, no billing integration. This is the admin-only
  // manual toggle (billing can call the same repository method later
  // once it exists). Mirrors updateStoreStatus above: existence check,
  // repository write, audit trail via the new ADMIN_STORE_PLAN_CHANGED
  // event.
  
  requestFeature: async (userId: string) => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');
    const store = await storesRepository.findBySellerProfileId(sellerProfile.id);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    if (store.status !== 'ACTIVE') {
      throw new BadRequestError('Store must be active before requesting featured placement.');
    }
    if (store.plan === 'FEATURED') {
      throw new BadRequestError('Store is already featured.');
    }
    if (store.featureRequestedAt) {
      return store;
    }
    return storesRepository.setFeatureRequestedAt(store.id, new Date());
  },

updateStorePlan: async (
    id: string,
    input: UpdateStorePlanInput,
    adminUserId: string
  ): Promise<StoreDetails> => {
    const store = await storesRepository.findById(id);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    const updated = await storesRepository.updatePlan(id, input.plan);

    void auditLog({
      event: AuditEvent.ADMIN_STORE_PLAN_CHANGED,
      userId: adminUserId,
      details: { storeId: id, plan: input.plan },
    });

    return updated;
  },

  // --- Follow / unfollow -------------------------------------------------

  toggleFollow: async (
    userId: string,
    storeId: string
  ): Promise<{ action: 'followed' | 'unfollowed' }> => {
    const store = await storesRepository.findById(storeId);
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    }
    const sellerProfile = await sellersRepository.findById(store.sellerProfileId);
    if (sellerProfile?.userId === userId) {
      throw new ForbiddenError('You cannot follow your own store.', 'CANNOT_FOLLOW_OWN_STORE');
    }

    const existing = await storeFollowersRepository.findByUserAndStore(userId, storeId);
    if (existing) {
      try {
        await storeFollowersRepository.delete(userId, storeId);
      } catch (err) {
        if (!isPrismaError(err, 'P2025')) throw err;
      }
      // Gap #10: fire-and-forget, see createStore's own comment above.
      activityService.record({ userId, ...activityTemplates.storeUnfollowed(store.id, store.name) });
      return { action: 'unfollowed' };
    }

    try {
      await storeFollowersRepository.create(userId, storeId);
    } catch (err) {
      if (!isPrismaError(err, 'P2002')) throw err;
    }
    // Gap #10: fire-and-forget, see createStore's own comment above.
    activityService.record({ userId, ...activityTemplates.storeFollowed(store.id, store.name) });
    return { action: 'followed' };
  },

  getMyFollowedStores: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<StoreFollowerWithStore>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { follows, total } = await storeFollowersRepository.findManyByUserId(userId, query);
    return { items: follows, meta: buildPaginationMeta(total, page, limit) };
  },

  // --- Reviews -------------------------------------------------------------

  createReview: async (
    raterId: string,
    storeId: string,
    input: CreateStoreReviewInput
  ): Promise<void> => {
    const store = await storesRepository.findById(storeId);
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    }

    const sellerProfile = await sellersRepository.findById(store.sellerProfileId);
    if (!sellerProfile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');

    if (sellerProfile.userId === raterId) {
      throw new ForbiddenError('You cannot review your own store.', 'CANNOT_RATE_OWN_STORE');
    }

    // SECURITY FIX (blocked-user coverage gap): same gap closed on the
    // service-requests/appointments/service-reviews paths — a store
    // review requires no prior transaction check at all here (unlike
    // service-reviews, which is gated on a COMPLETED request), so this
    // is the most exposed of the review surfaces to a blocked user
    // leaving a purely retaliatory review with zero prior interaction.
    if (await blockedUsersService.isBlockedEitherDirection(raterId, sellerProfile.userId)) {
      throw new ForbiddenError('You cannot review this store.', 'USER_BLOCKED');
    }

    const existing = await storeReviewsRepository.findBySellerAndRater(sellerProfile.id, raterId);
    if (existing) throw new ConflictError('You have already reviewed this store.', 'ALREADY_REVIEWED_STORE');

    try {
      await prisma.$transaction(async tx => {
        await storeReviewsRepository.create(tx, {
          sellerProfileId: sellerProfile.id,
          raterId,
          score: input.score,
          comment: input.comment,
        });
        await sellersRepository.recomputeRatingAggregate(tx, sellerProfile.id);
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictError('You have already reviewed this store.', 'ALREADY_REVIEWED_STORE');
      }
      throw error;
    }
  },

  getStoreReviews: async (
    storeId: string,
    query: GetStoreReviewsQuery
  ): Promise<PaginatedResult<StoreReviewWithRater>> => {
    const store = await storesRepository.findById(storeId);
    if (!store) throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');

    const { reviews, total } = await storeReviewsRepository.findManyBySellerProfileId(
      store.sellerProfileId,
      query
    );
    return {
      items: reviews,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  // --- Analytics -------------------------------------------------------
  //
  // STORE-ANALYTICS (Foundation v1): deliberately excludes
  // orders/revenue/conversion — this schema has no Order model at all,
  // so there is no honest number to show for any of the three. Every
  // metric below reads from data that already exists (StoreDetails.views,
  // StoreFollower, Promotion.usageCount, Product.views) — no new
  // tracking pipeline required for this first cut.
  getMyStoreAnalytics: async (userId: string): Promise<StoreAnalytics> => {
    const store = await requireOwnStore(userId);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [followers, newFollowers7d, newFollowers30d, activeProducts, promotions, topProducts] =
      await Promise.all([
        storeFollowersRepository.countByStoreId(store.id),
        storeFollowersRepository.countByStoreIdSince(store.id, since7d),
        storeFollowersRepository.countByStoreIdSince(store.id, since30d),
        storesRepository.countActiveProducts(store.id),
        promotionsRepository.findByStoreId(store.id),
        productsRepository.findTopByStoreId(store.id, 5),
      ]);

    return {
      views: store.views,
      followers,
      newFollowers7d,
      newFollowers30d,
      activeProducts,
      activePromotions: promotions.filter(p => p.status === 'ACTIVE').length,
      promotionUses: promotions.reduce((sum, p) => sum + p.usageCount, 0),
      topProducts: topProducts.map(p => ({
        id: p.id,
        name: p.name,
        views: p.views,
        image: p.images[0] ?? null,
      })),
    };
  },
};

// Exposed for products.service.ts, which needs "this user's own store"
// without duplicating the sellerProfile-lookup + suspension-check logic
// above (same relationship products.service.ts has to
// service-listings.service.ts's requireOwnProvider via
// service-providers.repository.ts).
export const requireOwnStoreForProducts = requireOwnStore;
