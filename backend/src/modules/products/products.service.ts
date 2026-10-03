import { prisma } from '../../config/prisma';
import { Product } from '@prisma/client';
import { productsRepository, ProductWithStore } from './products.repository';
import { CreateProductInput, UpdateProductInput, GetProductsQuery } from './products.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { uploadImage, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { storesRepository } from '../stores/stores.repository';
import { requireStoreAccessForProducts } from '../stores/store-members.service';
import { productCategoriesRepository } from '../product-categories/product-categories.repository';
import { storeTypesRepository } from '../store-types/store-types.repository';
import { storeFollowersRepository } from '../stores/store-followers.repository';
import { notificationEvents } from '../notifications/notifications.service';
import { savedSearchEvents } from '../saved-searches';
import { activityService, activityTemplates } from '../activity';
import { logger } from '../../shared/utils/logger';
import { withProductImagesLock, withStoreProductCreationLock } from '../../shared/utils/adLock';
import { createEntityImageOperations } from '../../shared/utils/entityImageOperations';
import { promotionsService, EffectivePrice } from '../promotions/promotions.service';
import { fraudService } from '../fraud';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';
import { cachedPublicList, bumpPublicListCache, hidePublicEntities } from '../../shared/utils/publicListCache';

const MAX_PRODUCT_IMAGES = MAX_IMAGES_PER_ENTITY; // same cap as ads.images / service-listings.images — see config/limits.ts

// FIX SEC-4.1: addImages/removeImage used to be ~75 lines of
// hand-rolled logic here, near-identical to service-listings.service.ts's
// copy of the same thing. Now built from the shared factory — see
// entityImageOperations.ts's doc comment for why ads.service.ts is not
// part of this extraction.
const productImageOperations = createEntityImageOperations({
  repository: productsRepository,
  withLock: withProductImagesLock,
  uploadFolder: 'products',
  maxImages: MAX_PRODUCT_IMAGES,
  entityLabel: 'product',
  notFoundCode: 'PRODUCT_NOT_FOUND',
  notOwnedCode: 'NOT_YOUR_PRODUCT',
});

// Stores proposal's "مجاني: 20 منتج" plan cap. Enforced here in
// application code rather than a DB constraint, same as
// service-listings' availabilityStatus gate — since it depends on
// StoreDetails.plan, not a static schema rule.
const FREE_PLAN_PRODUCT_LIMIT = 20;

const getFreeProductLimit = async (storeTypeId: string): Promise<number | null> => {
  const storeType = await storeTypesRepository.findById(storeTypeId);
  return storeType?.freeProductLimit ?? FREE_PLAN_PRODUCT_LIMIT;
};

// PROMO-1: shape returned alongside every public-facing product,
// folding in whatever promotions.service.ts's getEffectivePrice
// resolved — an ACTIVE Promotion if one is live, else the older static
// discountPrice fallback, never both. See that function's own doc
// comment for the full reconciliation rule.
export type ProductWithEffectivePrice<T> = T & { effectivePrice: EffectivePrice };

function deriveAvailabilityFromStock(
  stock: number | null | undefined,
  fallback: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK' | undefined,
): 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK' {
  if (stock === undefined || stock === null) return fallback ?? 'IN_STOCK';
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= 5) return 'LIMITED';
  return 'IN_STOCK';
}

export const productsService = {
  createProduct: async (
    userId: string,
    input: CreateProductInput,
    files: Express.Multer.File[],
    offlineOperationId?: string | null,
  ): Promise<Product> => {
    // FIX OFFLINE-IDEMPOTENCY-01
    if (offlineOperationId) {
      const existing = await prisma.product.findUnique({
        where: { offlineOperationId },
      });
      if (existing) {
        const store = await requireStoreAccessForProducts(userId, 'manageProducts');
        if (existing.storeId !== store.id) {
          throw new BadRequestError(
            'Offline operation id already used by another store',
            'OFFLINE_OP_ID_CONFLICT',
          );
        }
        return existing;
      }
    }

    const store = await requireStoreAccessForProducts(userId, 'manageProducts');

    if (store.status !== 'ACTIVE') {
      throw new ForbiddenError(
        'Your store must be approved before you can publish products.',
        'STORE_NOT_ACTIVE'
      );
    }

    // AUDIT-FIX (#3): require at least one image (Cloudinary path is live;
    // same rule as createAd).
    if (!files?.length) {
      throw new BadRequestError(
        'At least one product image is required.',
        'PRODUCT_IMAGE_REQUIRED',
      );
    }

    const category = await productCategoriesRepository.findById(input.categoryId);
    if (!category || !category.isActive) {
      throw new BadRequestError('Invalid or inactive product category.');
    }

    // FIX M-006: fast-path check, before doing any Cloudinary uploads —
    // this alone does NOT close the race (see the lock-guarded re-check
    // below, which is what actually prevents two concurrent requests
    // from both slipping past the cap).
    if (store.plan === 'FREE') {
      const limit = await getFreeProductLimit(store.storeTypeId);
      if (limit !== null) {
        const activeCount = await storesRepository.countActiveProducts(store.id);
        if (activeCount >= limit) {
          throw new BadRequestError(
            `Free plan stores can list up to ${limit} products. Upgrade to add more.`,
            'PRODUCT_LIMIT_REACHED'
          );
        }
      }
    }

    if (files.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestError(`You can upload at most ${MAX_PRODUCT_IMAGES} images.`);
    }

    const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'products')));

    let product: Product;
    try {
      // FIX M-006: the count check above and the insert below are now
      // serialized per-store via withStoreProductCreationLock (same
      // check-then-act race closed for ad creation by
      // withUserAdCreationLock — see adLock.ts). The count is
      // re-checked here, *after* acquiring the lock, immediately before
      // the insert — this is the check that actually matters; the one
      // above is only a fast-path so an obviously-over-the-cap request
      // doesn't pay for Cloudinary uploads first.
      product = await withStoreProductCreationLock(store.id, async () => {
        if (store.plan === 'FREE') {
          const limit = await getFreeProductLimit(store.storeTypeId);
          if (limit !== null) {
            const activeCount = await storesRepository.countActiveProducts(store.id);
            if (activeCount >= limit) {
              throw new BadRequestError(
                `Free plan stores can list up to ${limit} products. Upgrade to add more.`,
                'PRODUCT_LIMIT_REACHED'
              );
            }
          }
        }

        return prisma.$transaction(async tx =>
          productsRepository.create(tx, store.id, {
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            images: uploads.map(u => u.url),
            price: input.price,
            discountPrice: input.discountPrice,
            wholesalePrice: input.wholesalePrice,
            wholesaleMinQty: input.wholesaleMinQty,
            availability: deriveAvailabilityFromStock(input.stockQuantity, input.availability),
            stockQuantity: input.stockQuantity ?? null,
            offlineOperationId: offlineOperationId ?? null,
          })
        );
      });
    } catch (error: unknown) {
      // FIX OFFLINE-IDEMPOTENCY-01: concurrent same offline op id
      if (
        offlineOperationId &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await prisma.product.findUnique({ where: { offlineOperationId } });
        if (existing && existing.storeId === store.id) {
          product = existing;
        } else {
          await cleanupUploadedImages(uploads.map(u => u.publicId));
          throw error;
        }
      } else {
        await cleanupUploadedImages(uploads.map(u => u.publicId));
        throw error;
      }
    }

    // Fire-and-forget fan-out to everyone following this store — a
    // notification failing here must never fail product creation, same
    // convention as every other notificationEvents caller.
    storeFollowersRepository
      .findUserIdsByStoreId(store.id)
      .then(followerIds => notificationEvents.onStoreNewProduct(followerIds, store.id, store.name, product.name))
      .catch(() => undefined);

    // PLATFORM-WIDE-01: notify saved-search owners (type 'products')
    // whose criteria match this new product — same fire-and-forget
    // contract as ads.service.ts's createAd -> savedSearchEvents
    // .onAdCreated call, for the same reason: a matching failure must
    // never fail product creation itself.
    savedSearchEvents.onProductCreated(product, userId).catch((err) =>
      logger.error('Failed to process saved-search matches for new product', { err, productId: product.id })
    );

    // Gap #10: fire-and-forget, same contract as activityService
    // .record()'s own doc comment — never awaited, never fails product
    // creation. Logged for `userId` (the store owner), not store.id.
    activityService.record({ userId, ...activityTemplates.productCreated(product.id, product.name) });

    // Fraud scoring (content heuristics) — fire-and-forget, same contract as ads.service scoreAd
    fraudService
      .scoreListing({
        entityType: 'PRODUCT',
        id: product.id,
        userId,
        title: product.name,
        description: product.description ?? '',
        price: product.price != null ? Number(product.price) : null,
        categoryId: product.categoryId,
      })
      .catch(() => undefined);

    return product;
  },

  getMyProducts: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
      availability?: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
      search?: string;
    }
  ): Promise<PaginatedResult<Product>> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    const { products, total } = await productsRepository.findManyByStoreId(store.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { items: products, meta: buildPaginationMeta(total, page, limit) };
  },

  getProducts: async (
    query: GetProductsQuery
  ): Promise<PaginatedResult<ProductWithEffectivePrice<ProductWithStore>>> => {
    // FIX PUBLIC-LIST-CACHE-01: Redis SWR cache; see publicListCache.ts.
    return cachedPublicList('products', query, async () => {
      const { products, total } = await productsRepository.findMany(query);
      // PROMO-1: one batched query for the whole page's live promotions
      // rather than N+1 — see promotionsService.getEffectivePrices.
      const effectivePrices = await promotionsService.getEffectivePrices(products);
      const items = products.map(product => ({
        ...product,
        effectivePrice: effectivePrices.get(product.id)!,
      }));
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      return { items, meta: buildPaginationMeta(total, page, limit) };
    });
  },

  // FEAT-FAVORITE-POLYMORPHIC PR2: facade for cross-module use
  // (favoritesService), same pattern as ads.service.ts's
  // findAdForReference / stores.service.ts's findStoreForReference —
  // returns the product without side effects (no view increment,
  // unlike getProductById which is the public detail-page path) so
  // favoritesService can validate a PRODUCT favorite target exists
  // without importing productsRepository directly.
  findProductForReference: async (id: string): Promise<Product | null> => {
    const product = await productsRepository.findById(id);
    if (!product || product.status === 'DELETED') return null;
    return product;
  },

  getProductById: async (id: string): Promise<ProductWithEffectivePrice<ProductWithStore>> => {
    const product = await productsRepository.findPublicById(id);
    if (!product || product.status === 'DELETED') {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    // SEC-FIX: findMany's list query already excludes suspended-seller
    // products (see products.repository.ts), but findPublicById here is
    // a direct-by-id lookup with no such filter — a suspended seller's
    // product page was still fully viewable/purchasable by anyone who
    // had (or guessed) its id, even though it had already dropped out
    // of every list/search result. Treat it the same as a deleted
    // product: 404, not a partial "hidden from search but still live"
    // state. Checked here rather than folded into findPublicById's
    // query so a suspended seller browsing their own dashboard (which
    // doesn't go through this path) is unaffected.
    if (product.store.sellerProfile.suspended) {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    // SEC-FIX: same gap, different trigger — an admin blocking a store
    // via storesService.updateStoreStatus (status -> BLOCKED) already
    // hides its products from findMany's list query (`store: { status:
    // 'ACTIVE' }`), but this direct-by-id lookup ignored store.status
    // entirely, so a blocked store's product page — and the ability to
    // buy from it — stayed reachable via direct link.
    if (product.store.status !== 'ACTIVE') {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    // Fire-and-forget: a failed view-count bump shouldn't fail the read.
    productsRepository.incrementViews(id).catch(() => undefined);
    const effectivePrice = await promotionsService.getEffectivePrice(product);
    return { ...product, effectivePrice };
  },

  updateProduct: async (
    userId: string,
    id: string,
    input: UpdateProductInput
  ): Promise<Product> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    const product = await productsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    if (product.storeId !== store.id) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    if (input.categoryId) {
      const category = await productCategoriesRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new BadRequestError('Invalid or inactive product category.');
      }
    }

    const patch = { ...input };
    if (input.stockQuantity !== undefined) {
      patch.availability = deriveAvailabilityFromStock(
        input.stockQuantity,
        input.availability ?? product.availability,
      );
    }
    const updated = await productsRepository.update(id, patch);
    // Edits (incl. stock/availability): soft invalidation (stale once, then
    // refreshed). A status change away from ACTIVE must hide the product now.
    if (patch.status && patch.status !== 'ACTIVE') {
      await hidePublicEntities('products');
    } else {
      await bumpPublicListCache('products');
    }

    // Gap #10: fire-and-forget, see createProduct's own comment above.
    activityService.record({ userId, ...activityTemplates.productUpdated(updated.id, updated.name) });

    fraudService
      .scoreListing({
        entityType: 'PRODUCT',
        id: updated.id,
        userId,
        title: updated.name,
        description: updated.description ?? '',
        price: updated.price != null ? Number(updated.price) : null,
        categoryId: updated.categoryId,
      })
      .catch(() => undefined);

    // STORE-FOLLOWER-NOTIFICATIONS (Foundation v1): fires once, on the
    // OUT_OF_STOCK -> (IN_STOCK | LIMITED) edge only — checked against
    // `product` (the pre-update row), not just "input.availability was
    // provided", so a PATCH that touches other fields on an already
    // in-stock product never re-fires this. Fire-and-forget, same
    // convention as onStoreNewProduct above.
    if (product.availability === 'OUT_OF_STOCK' && updated.availability !== 'OUT_OF_STOCK') {
      storeFollowersRepository
        .findUserIdsByStoreId(store.id)
        .then(followerIds =>
          notificationEvents.onStoreProductRestocked(followerIds, store.id, updated.id, updated.name)
        )
        .catch(() => undefined);
    }

    return updated;
  },

  deleteProduct: async (userId: string, id: string): Promise<void> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    const product = await productsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    if (product.storeId !== store.id) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    await productsRepository.softDelete(id);
    await hidePublicEntities('products');

    await Promise.all(
      product.images.map(imageUrl => {
        const publicId = extractCloudinaryPublicId(imageUrl);
        return publicId ? deleteImage(publicId).catch(() => undefined) : undefined;
      })
    );

    // Gap #10: fire-and-forget, see createProduct's own comment above.
    activityService.record({ userId, ...activityTemplates.productDeleted(product.id, product.name) });
  },

  // Gap #3 fix: closes the report's finding — products had no way to
  // add/replace photos after creation (PATCH is JSON-only, no images
  // field). Delegates to the shared factory (FIX SEC-4.1) — ownership
  // check, 10-image cap, lock-guarded re-check, parallel uploads,
  // cleanup on failure are all implemented once in
  // entityImageOperations.ts rather than duplicated here.
  addImages: async (
    productId: string,
    userId: string,
    files: Express.Multer.File[]
  ): Promise<Product> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    return productImageOperations.addImages(productId, product => product.storeId === store.id, files);
  },

  // Gap #3 fix: mirrors ads.service.ts's removeImage, including the
  // "can't remove the last image" guard (EPIC 1.5's rationale applies
  // identically here — a product must always keep at least one image).
  // Delegates to the shared factory (FIX SEC-4.1).
  removeImage: async (
    productId: string,
    userId: string,
    imageUrl: string
  ): Promise<Product> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    return productImageOperations.removeImage(productId, product => product.storeId === store.id, imageUrl);
  },

  // Gap #11: delegates to the shared factory's reorderImages —
  // ownership check + permutation validation + lock-guarded re-check
  // are all implemented once in entityImageOperations.ts.
  reorderImages: async (
    productId: string,
    userId: string,
    orderedImages: string[]
  ): Promise<Product> => {
    const store = await requireStoreAccessForProducts(userId, 'manageProducts');
    return productImageOperations.reorderImages(productId, product => product.storeId === store.id, orderedImages);
  },
};
